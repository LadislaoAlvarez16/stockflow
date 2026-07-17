import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { WebhookEncryptionService } from './webhook-encryption.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { WebhookEventType } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class WebhookSubscriptionsService {
  constructor(
    private prisma: PrismaService,
    private encryptionService: WebhookEncryptionService,
  ) {}

  async create(createWebhookDto: CreateWebhookDto, userId: string) {
    // Generar un secret aleatorio de 32 bytes (64 caracteres hex)
    const rawSecret = crypto.randomBytes(32).toString('hex');

    // Encriptar el secret
    const encryptedSecret = this.encryptionService.encrypt(rawSecret);

    const subscription = await this.prisma.webhookSubscription.create({
      data: {
        url: createWebhookDto.url,
        events: createWebhookDto.events,
        encryptedSecret,
        createdById: userId,
      },
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        createdAt: true,
      },
    });

    // Retornamos el secret en texto plano por única vez
    return {
      ...subscription,
      secret: rawSecret,
    };
  }

  async findAll() {
    return this.prisma.webhookSubscription.findMany({
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const subscription = await this.prisma.webhookSubscription.findUnique({
      where: { id },
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!subscription) {
      throw new NotFoundException(
        `Webhook subscription with ID \${id} not found`,
      );
    }

    return subscription;
  }

  async update(id: string, updateWebhookDto: UpdateWebhookDto) {
    // Verificar que exista
    await this.findOne(id);

    return this.prisma.webhookSubscription.update({
      where: { id },
      data: updateWebhookDto,
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deactivate(id: string) {
    // Verificar que exista
    await this.findOne(id);

    return this.prisma.webhookSubscription.update({
      where: { id },
      data: { isActive: false },
      select: {
        id: true,
        url: true,
        isActive: true,
      },
    });
  }

  async testWebhook(id: string) {
    const subscription = await this.prisma.webhookSubscription.findUnique({
      where: { id },
      select: { id: true, url: true, encryptedSecret: true },
    });

    if (!subscription) {
      throw new NotFoundException(
        `Webhook subscription with ID \${id} not found`,
      );
    }

    return subscription;
  }

  async getDeliveries(
    id: string,
    cursor?: string,
    event?: WebhookEventType,
    statusCode?: number,
    dateFrom?: string,
  ) {
    const take = 50;

    const where: any = {
      subscriptionId: id,
    };
    if (event) where.event = event;
    if (statusCode) where.statusCode = statusCode;
    if (dateFrom) where.deliveredAt = { gte: new Date(dateFrom) };

    const deliveries = await this.prisma.webhookDelivery.findMany({
      take,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      where,
      orderBy: [{ deliveredAt: 'desc' }, { id: 'desc' }],
    });

    const nextCursor =
      deliveries.length === take ? deliveries[take - 1].id : null;

    return {
      data: deliveries,
      nextCursor,
    };
  }
}
