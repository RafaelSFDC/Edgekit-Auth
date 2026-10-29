import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    return c.json(
      {
        errors: [
          {
            message: err.message,
            code: `http_${err.status}`,
          },
        ],
      },
      err.status
    );
  }

  if (err instanceof ZodError) {
    return c.json(
      {
        errors: err.errors.map((e) => ({
          message: e.message,
          code: `validation_${e.code}`,
          param: e.path.join("."),
        })),
      },
      400
    );
  }

  console.error("Unhandled Error:", err);
  return c.json(
    {
      errors: [
        {
          message: err.message || "Internal Server Error",
          code: "internal_error",
        },
      ],
    },
    500
  );
};
