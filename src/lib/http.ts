import { AppError } from "@/lib/errors";

export async function handle<T>(action: () => Promise<T>): Promise<Response> {
  try {
    const result = await action();
    return Response.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error(error);
    return Response.json(
      { error: "Something went wrong. Please try again.", code: "INTERNAL" },
      { status: 500 },
    );
  }
}

export async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new AppError("The request body must be valid JSON.", 400, "INVALID_JSON");
  }
}
