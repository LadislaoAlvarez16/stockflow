import { Controller, Get, Post, Body, Patch, Param, ParseUUIDPipe, Query, ParseIntPipe } from '@nestjs/common';
import { WebhookSubscriptionsService } from './webhook-subscriptions.service';
import { WebhookDispatcherService } from './webhook-dispatcher.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole, WebhookEventType } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('webhooks')
@Roles(UserRole.ADMIN)
export class WebhooksController {
  constructor(
    private readonly webhooksService: WebhookSubscriptionsService,
    private readonly webhookDispatcherService: WebhookDispatcherService,
  ) {}

  @Get('events')
  getEvents() {
    return [
      { id: WebhookEventType.stock_low, description: 'Se dispara cuando el stock de un producto cae por debajo o igual a su mínimo configurado.' },
      { id: WebhookEventType.stock_out, description: 'Se dispara cuando el stock de un producto llega a cero.' },
      { id: WebhookEventType.movement_created, description: 'Se dispara cada vez que se registra un movimiento de stock (Inbound, Outbound, Transfer, Adjustment).' },
      { id: WebhookEventType.batch_expiring, description: 'Se dispara cuando un lote está próximo a vencer según la configuración del sistema.' },
      { id: WebhookEventType.inventory_reconciled, description: 'Se dispara al finalizar una sesión de inventario físico (sea exitosa o con errores).' },
    ];
  }

  @Post()
  create(@Body() createWebhookDto: CreateWebhookDto, @CurrentUser() user: any) {
    const userId = user.id || user.sub;
    return this.webhooksService.create(createWebhookDto, userId);
  }

  @Get()
  findAll() {
    return this.webhooksService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.webhooksService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() updateWebhookDto: UpdateWebhookDto) {
    return this.webhooksService.update(id, updateWebhookDto);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.webhooksService.deactivate(id);
  }

  @Get(':id/deliveries')
  async getDeliveries(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('cursor') cursor?: string,
    @Query('event') event?: WebhookEventType,
    @Query('statusCode') statusCode?: string,
    @Query('dateFrom') dateFrom?: string,
  ) {
    const parsedStatusCode = statusCode ? parseInt(statusCode, 10) : undefined;
    return this.webhooksService.getDeliveries(id, cursor, event, parsedStatusCode, dateFrom);
  }

  @Post(':id/test')
  async testWebhook(@Param('id', ParseUUIDPipe) id: string) {
    const subscription = await this.webhooksService.testWebhook(id);
    
    await this.webhookDispatcherService.dispatchTestEvent(
      subscription.id,
      subscription.url,
      subscription.encryptedSecret
    );

    return {
      message: 'Evento de prueba encolado exitosamente',
    };
  }
}
