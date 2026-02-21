import { findAdminByEmail, insertAdminUser } from "@/db/queries/admin-queries";

async function seedAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required");
  }

  try {
    const existing = await findAdminByEmail(adminEmail);

    if (existing.length > 0) {
      console.info(`Admin account already exists for ${adminEmail}, skipping seed.`);
      return;
    }

    await insertAdminUser(adminEmail);
    console.info(`Admin account created for ${adminEmail}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("auth_users")) {
      console.info("auth_users table does not exist yet. Skipping admin seed — will be created in a later story.");
    } else {
      throw error;
    }
  }
}

seedAdmin().catch((error) => {
  console.error("Failed to seed admin:", error);
  process.exit(1);
});
