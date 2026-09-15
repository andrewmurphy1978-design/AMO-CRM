import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { hashPassword } from "../src/lib/password";

// engineType "client" (see schema.prisma) requires a driver adapter even
// here in Node.js — there's no bundled query engine binary to fall back to.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? "Admin";

  if (!email || !password) {
    console.log(
      "SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set, skipping admin user seed."
    );
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin user ${email} already exists, skipping.`);
    return;
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: { email, name, passwordHash, role: "ADMIN" },
  });

  console.log(`Created admin user: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
