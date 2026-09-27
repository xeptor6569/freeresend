export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { bootstrap } = await import("./lib/bootstrap");
    try {
      await bootstrap();
    } catch (error) {
      console.error("FreeResend failed to start:", error);
      process.exit(1);
    }
  }
}
