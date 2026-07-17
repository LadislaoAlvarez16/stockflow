import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class WebhookEncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor() {
    const keyString = process.env.WEBHOOK_ENCRYPTION_KEY;
    if (!keyString || keyString.length !== 64) {
      // 64 chars in hex = 32 bytes
      throw new Error(
        'WEBHOOK_ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters). Use "openssl rand -hex 32" to generate it.',
      );
    }
    this.key = Buffer.from(keyString, 'hex');
  }

  encrypt(plaintext: string): string {
    try {
      const iv = crypto.randomBytes(12); // 96-bit IV is recommended for GCM
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag().toString('hex');

      // format: iv:encrypted:authTag
      return `\${iv.toString('hex')}:\${encrypted}:\${authTag}`;
    } catch (error) {
      throw new InternalServerErrorException('Error encrypting webhook secret');
    }
  }

  decrypt(ciphertext: string): string {
    try {
      const parts = ciphertext.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid ciphertext format');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const encryptedText = Buffer.from(parts[1], 'hex');
      const authTag = Buffer.from(parts[2], 'hex');

      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedText, undefined, 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new InternalServerErrorException('Error decrypting webhook secret');
    }
  }
}
