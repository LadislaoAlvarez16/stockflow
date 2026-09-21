import { Test, TestingModule } from '@nestjs/testing';
import { WebhookEncryptionService } from './webhook-encryption.service';
import { ConfigService } from '@nestjs/config';

describe('WebhookEncryptionService - N-05 Template Literals', () => {
  let service: WebhookEncryptionService;
  const mockKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(async () => {
    process.env.WEBHOOK_ENCRYPTION_KEY = mockKey;
    const module: TestingModule = await Test.createTestingModule({
      providers: [WebhookEncryptionService],
    }).compile();

    service = module.get<WebhookEncryptionService>(WebhookEncryptionService);
  });

  it('encrypts to format iv:encrypted:authTag without literal ${}', () => {
    const plain = 'secreto-123';
    const cipher = service.encrypt(plain);
    
    // Pattern: 24 hex (IV) : variable hex (encrypted) : 32 hex (AuthTag)
    expect(cipher).toMatch(/^[0-9a-f]{24}:[0-9a-f]+:[0-9a-f]{32}$/);
    
    // The previous bug caused the output to literally contain '${iv.toString(...)}'
    expect(cipher).not.toContain('${');
    
    const decrypted = service.decrypt(cipher);
    expect(decrypted).toBe(plain);
    
    const cipher2 = service.encrypt(plain);
    expect(cipher).not.toBe(cipher2); // Non-deterministic (random IV)
    
    // Alter cipher text should fail
    const altered = cipher.substring(0, cipher.length - 1) + (cipher.endsWith('0') ? '1' : '0');
    expect(() => service.decrypt(altered)).toThrow();
  });
});
