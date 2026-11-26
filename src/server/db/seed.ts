import { config } from "dotenv";
import { eq, sql } from "drizzle-orm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../auth/password";
import { createDb } from "./create";
import { categories, specialDates, userSettings, users } from "./schema";
import { safeErrorLog } from "../safe-log";

const CATEGORIES = [
  { name: "Estudios ITLA", color: "#2563eb", icon: "graduation-cap" },
  { name: "Inglés", color: "#7c3aed", icon: "languages" },
  { name: "Proyectos personales", color: "#059669", icon: "rocket" },
  { name: "Trabajo", color: "#d97706", icon: "briefcase" },
  { name: "Reuniones", color: "#dc2626", icon: "users" },
  { name: "Actividades personales", color: "#db2777", icon: "heart" },
];

// Festivos fijos de República Dominicana (los movibles se ajustan manualmente).
const HOLIDAYS: Array<[string, string]> = [
  ["Año Nuevo", "01-01"],
  ["Día de los Santos Reyes", "01-06"],
  ["Día de Nuestra Señora de la Altagracia", "01-21"],
  ["Natalicio de Juan Pablo Duarte", "01-26"],
  ["Día de la Independencia", "02-27"],
  ["Día del Trabajo", "05-01"],
  ["Día de la Restauración", "08-16"],
  ["Día de Nuestra Señora de las Mercedes", "09-24"],
  ["Día de la Constitución", "11-06"],
  ["Navidad", "12-25"],
];

export async function seed(url: string, opts: { email: string; password: string; timezone?: string; name?: string }) {
  const { db, pool } = createDb(url, { max: 2 });
  try {
    const email = opts.email.trim().toLowerCase();
    const timezone = opts.timezone ?? "America/Santo_Domingo";

    let [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
    if (!user) {
      [user] = await db
        .insert(users)
        .values({ email, name: opts.name ?? "Propietario", passwordHash: await hashPassword(opts.password) })
        .returning();
      console.log(`Usuario creado: ${email}`);
    } else {
      console.log(`Usuario ya existe: ${email} (contraseña intacta)`);
    }
    const userId = user!.id;

    await db
      .insert(userSettings)
      .values({
        userId,
        displayName: user!.name,
        timezone,
        defaultReminders: [{ offsetMinutes: 15, channel: "internal" }],
      })
      .onConflictDoNothing();

    // Solo siembra si el usuario nunca tuvo categorías / festivos (respeta ediciones y borrados).
    const [{ c: catCount }] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(categories)
      .where(eq(categories.userId, userId));
    if (catCount === 0) {
      await db.insert(categories).values(CATEGORIES.map((c) => ({ ...c, userId })));
      console.log(`Categorías creadas: ${CATEGORIES.length}`);
    }

    const [{ c: holCount }] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(specialDates)
      .where(sql`${specialDates.userId} = ${userId} and ${specialDates.type} = 'holiday'`);
    if (holCount === 0) {
      await db.insert(specialDates).values(
        HOLIDAYS.map(([title, md]) => ({
          userId,
          title,
          type: "holiday" as const,
          date: `2000-${md}`,
          recursYearly: true,
          color: "#ef4444",
          icon: "flag",
        })),
      );
      console.log(`Festivos creados: ${HOLIDAYS.length}`);
    }
  } finally {
    await pool.end();
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  config({ path: ".env.local" });
  config();
  const { DATABASE_URL, OWNER_EMAIL, OWNER_PASSWORD, DEFAULT_TIMEZONE } = process.env;
  if (!DATABASE_URL || !OWNER_EMAIL || !OWNER_PASSWORD) {
    console.error("Faltan DATABASE_URL, OWNER_EMAIL u OWNER_PASSWORD");
    process.exit(1);
  }
  seed(DATABASE_URL, { email: OWNER_EMAIL, password: OWNER_PASSWORD, timezone: DEFAULT_TIMEZONE })
    .then(() => console.log("Seed completo."))
    .catch((e) => {
      safeErrorLog(e, "[seed]");
      process.exit(1);
    });
}
