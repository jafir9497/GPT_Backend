import bcrypt from 'bcryptjs';

export class BcryptService {
  private static readonly saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');

  // Hash password/PIN
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  // Compare password/PIN
  static async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // Hash PIN (4-digit)
  static async hashPin(pin: string): Promise<string> {
    // Validate PIN format
    if (!/^\d{4}$/.test(pin)) {
      throw new Error('PIN must be exactly 4 digits');
    }
    return this.hashPassword(pin);
  }

  // Compare PIN
  static async comparePin(pin: string, hash: string): Promise<boolean> {
    // Validate PIN format
    if (!/^\d{4}$/.test(pin)) {
      throw new Error('PIN must be exactly 4 digits');
    }
    return this.comparePassword(pin, hash);
  }

  // Generate salt (if needed for custom implementations)
  static async generateSalt(): Promise<string> {
    return bcrypt.genSalt(this.saltRounds);
  }

  // Hash with custom salt
  static async hashWithSalt(password: string, salt: string): Promise<string> {
    return bcrypt.hash(password, salt);
  }
}