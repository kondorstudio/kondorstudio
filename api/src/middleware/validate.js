const { ZodError } = require('zod');

module.exports = function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source] || {});
    if (result.success) {
      req[source] = result.data;
      return next();
    }

    const details =
      result.error instanceof ZodError ? result.error.flatten() : undefined;
    const issues = Array.isArray(result.error?.issues)
      ? result.error.issues.map((issue) => ({
          path: Array.isArray(issue.path) ? issue.path.join('.') : String(issue.path || ''),
          message: issue.message,
          code: issue.code,
        }))
      : undefined;
    return res.status(400).json({
      error: 'Validation failed',
      details,
      issues,
    });
  };
};
