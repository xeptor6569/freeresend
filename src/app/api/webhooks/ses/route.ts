import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/database";

// SES event publishing sets eventType; identity notifications set notificationType.
interface SESMessage {
  eventType?: string;
  notificationType?: string;
  mail: {
    messageId: string;
    timestamp: string;
    source: string;
    destination: string[];
  };
  delivery?: {
    timestamp: string;
    processingTimeMillis: number;
    recipients: string[];
    smtpResponse: string;
  };
  bounce?: {
    bounceType: string;
    bounceSubType: string;
    bouncedRecipients: Array<{
      emailAddress: string;
      action: string;
      status: string;
      diagnosticCode: string;
    }>;
    timestamp: string;
    feedbackId: string;
  };
  complaint?: {
    complainedRecipients: Array<{
      emailAddress: string;
    }>;
    timestamp: string;
    feedbackId: string;
    complaintFeedbackType: string;
  };
}

const SNS_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/;

async function confirmSubscription(subscribeUrl: unknown): Promise<boolean> {
  if (typeof subscribeUrl !== "string") return false;

  let url: URL;
  try {
    url = new URL(subscribeUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || !SNS_HOST.test(url.hostname)) return false;

  const response = await fetch(url);
  return response.ok;
}

async function handleSESWebhook(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.Type === "SubscriptionConfirmation") {
      if (await confirmSubscription(body.SubscribeURL)) {
        console.log(`Confirmed SNS subscription for topic ${body.TopicArn}`);
        return NextResponse.json({ message: "Subscription confirmed" });
      }
      console.warn("Rejected SNS subscription confirmation with an unexpected SubscribeURL");
      return NextResponse.json({ error: "Invalid SubscribeURL" }, { status: 400 });
    }

    // Handle SNS notification
    if (body.Type === "Notification") {
      const message: SESMessage = JSON.parse(body.Message);

      await processSESEvent(message);

      return NextResponse.json({ message: "Event processed" });
    }

    return NextResponse.json({ message: "Unknown event type" });
  } catch (error) {
    console.error("SES webhook error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function processSESEvent(message: SESMessage) {
  const eventType = (message.eventType ?? message.notificationType ?? "unknown").toLowerCase();

  try {
    // Find the email log by SES message ID
    const emailResult = await query(
      "SELECT * FROM email_logs WHERE ses_message_id = $1 LIMIT 1",
      [message.mail.messageId]
    );

    if (emailResult.rows.length === 0) {
      console.warn(
        `Email log not found for message ID: ${message.mail.messageId}`
      );
      return;
    }

    const emailLog = emailResult.rows[0];

    // Update email status based on event type
    let newStatus = emailLog.status;
    let errorMessage = null;

    switch (eventType) {
      case "delivery":
        newStatus = "delivered";
        break;
      case "bounce":
        newStatus = "bounced";
        errorMessage = message.bounce?.bouncedRecipients
          .map((r) => `${r.emailAddress}: ${r.diagnosticCode}`)
          .join("; ");
        break;
      case "complaint":
        newStatus = "complained";
        errorMessage = `Complaint from: ${message.complaint?.complainedRecipients
          .map((r) => r.emailAddress)
          .join(", ")}`;
        break;
      case "reject":
        newStatus = "failed";
        errorMessage = "Email rejected by SES";
        break;
    }

    // Update email log status
    await query(
      `UPDATE email_logs 
       SET status = $1, error_message = $2, webhook_data = $3
       WHERE id = $4`,
      [newStatus, errorMessage, JSON.stringify(message), emailLog.id]
    );

    // Create webhook event record
    await query(
      `INSERT INTO webhook_events (email_log_id, event_type, event_data, processed)
       VALUES ($1, $2, $3, $4)`,
      [emailLog.id, eventType, JSON.stringify(message), true]
    );

    console.log(
      `Processed ${eventType} event for email ${emailLog.id}`
    );
  } catch (error) {
    console.error("Failed to process SES event:", error);

    // Create unprocessed webhook event for manual review
    try {
      await query(
        `INSERT INTO webhook_events (email_log_id, event_type, event_data, processed)
         VALUES ($1, $2, $3, $4)`,
        [null, eventType, JSON.stringify(message), false]
      );
    } catch (insertError) {
      console.error("Failed to create webhook event record:", insertError);
    }
  }
}

function cors(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return response;
}

export async function POST(request: NextRequest) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return cors(new NextResponse(null, { status: 200 }));
  }

  try {
    const result = await handleSESWebhook(request);
    return cors(result);
  } catch (error) {
    console.error("API Error:", error);
    return cors(NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    ));
  }
}
