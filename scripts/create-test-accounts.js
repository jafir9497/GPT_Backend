const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createTestAccounts() {
  try {
    console.log('Creating test accounts...');

    // Hash the default PIN (1234)
    const hashedPin = await bcrypt.hash('1234', 10);

    // Test accounts data
    const testAccounts = [
      {
        phoneNumber: '+919566405278',
        firstName: 'Super',
        lastName: 'Admin',
        userType: 'SUPER_ADMIN',
        email: 'superadmin@goldloan.com',
        status: 'ACTIVE',
        pinHash: hashedPin,
      },
      {
        phoneNumber: '+919952008564',
        firstName: 'Admin',
        lastName: 'User',
        userType: 'ADMIN',
        email: 'admin@goldloan.com',
        status: 'ACTIVE',
        pinHash: hashedPin,
      },
      {
        phoneNumber: '+919865819458',
        firstName: 'Employee',
        lastName: 'Agent',
        userType: 'EMPLOYEE',
        email: 'employee@goldloan.com',
        status: 'ACTIVE',
        pinHash: hashedPin,
      },
    ];

    for (const accountData of testAccounts) {
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { phoneNumber: accountData.phoneNumber }
      });

      if (existingUser) {
        console.log(`User with phone ${accountData.phoneNumber} already exists. Updating...`);
        
        await prisma.user.update({
          where: { userId: existingUser.userId },
          data: {
            firstName: accountData.firstName,
            lastName: accountData.lastName,
            userType: accountData.userType,
            email: accountData.email,
            status: accountData.status,
            pinHash: accountData.pinHash,
            updatedAt: new Date(),
          }
        });

        // Create or update employee details if user is EMPLOYEE
        if (accountData.userType === 'EMPLOYEE') {
          const existingEmployee = await prisma.employeeDetail.findUnique({
            where: { userId: existingUser.userId }
          });

          if (!existingEmployee) {
            await prisma.employeeDetail.create({
              data: {
                userId: existingUser.userId,
                employeeId: `EMP${Date.now()}`,
                department: 'FIELD_OPERATIONS',
                designation: 'FIELD_AGENT',
                employmentStartDate: new Date(),
              }
            });
          }
        }

        console.log(`✅ Updated user: ${accountData.firstName} ${accountData.lastName} (${accountData.phoneNumber})`);
      } else {
        // Create new user
        const newUser = await prisma.user.create({
          data: {
            phoneNumber: accountData.phoneNumber,
            firstName: accountData.firstName,
            lastName: accountData.lastName,
            userType: accountData.userType,
            email: accountData.email,
            status: accountData.status,
            pinHash: accountData.pinHash,
          }
        });

        // Create employee details if user is EMPLOYEE
        if (accountData.userType === 'EMPLOYEE') {
          await prisma.employeeDetail.create({
            data: {
              userId: newUser.userId,
              employeeId: `EMP${Date.now()}`,
              department: 'FIELD_OPERATIONS',
              designation: 'FIELD_AGENT',
              employmentStartDate: new Date(),
            }
          });
        }

        console.log(`✅ Created user: ${accountData.firstName} ${accountData.lastName} (${accountData.phoneNumber})`);
      }
    }

    console.log('\n🎉 Test accounts created successfully!');
    console.log('\n📱 Login Details:');
    console.log('────────────────────────────────────────');
    console.log('Super Admin: +91 9566405278 (PIN: 1234)');
    console.log('Admin:       +91 9952008564 (PIN: 1234)');
    console.log('Employee:    +91 9865819458 (PIN: 1234)');
    console.log('────────────────────────────────────────');
    console.log('Note: All new registrations will be CUSTOMER by default');

  } catch (error) {
    console.error('❌ Error creating test accounts:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
createTestAccounts();