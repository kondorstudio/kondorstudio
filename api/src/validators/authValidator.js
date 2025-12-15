// api/src/validators/authValidator.js
const { z } = require('zod');

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(6).max(100),
  deviceName: z.string().trim().max(100).optional().nullable(),
});

const clientLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(6).max(100),
});

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(6).max(100),
});

module.exports = {
  loginSchema,
  clientLoginSchema,
  registerSchema,
};
