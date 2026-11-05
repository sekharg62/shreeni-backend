import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const email = 'sekhar@gmail.com';
  const passwordHash = await bcrypt.hash('password', 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      phone: '+916296446556',
      passwordHash,
      firstName: 'Sekhar',
      lastName: 'Ghosh',
      role: 'ADMIN',
    },
    create: {
      email,
      phone: '+916296446556',
      passwordHash,
      firstName: 'Sekhar',
      lastName: 'Ghosh',
      role: 'ADMIN',
    },
  });

  console.log(`Seeded ADMIN user: ${user.email} (${user.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
