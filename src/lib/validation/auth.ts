import { z } from "zod";

// Política de contraseña (recuperación): longitud mínima 12, máxima 128 (límite anti-DoS de argon2).
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`)
  .max(PASSWORD_MAX_LENGTH, `La contraseña no puede superar ${PASSWORD_MAX_LENGTH} caracteres`);

export const forgotPasswordBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

export const resetPasswordBody = z.object({
  // Sin mínimo de longitud: un token mal formado debe dar el mismo error genérico que uno inexistente.
  token: z.string().min(1).max(200),
  password: newPasswordSchema,
});

export const FORGOT_PASSWORD_MESSAGE =
  "Si el correo existe, recibirás un enlace para restablecer tu contraseña en unos minutos.";
