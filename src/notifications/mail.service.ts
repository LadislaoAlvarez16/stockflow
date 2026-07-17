import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private readonly mailFrom: string;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST'),
      port: this.configService.get<number>('SMTP_PORT'),
      secure: this.configService.get<number>('SMTP_PORT') === 465, // true for 465, false for other ports
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASSWORD'),
      },
    });

    this.mailFrom =
      this.configService.get<string>('MAIL_FROM') || 'no-reply@stockflow.com';
  }

  async sendMail(payload: {
    to: string[];
    subject: string;
    html: string;
  }): Promise<void> {
    // We intentionally let errors bubble up so BullMQ can catch them and retry
    await this.transporter.sendMail({
      from: this.mailFrom,
      to: payload.to.join(', '),
      subject: payload.subject,
      html: payload.html,
    });
  }
}
