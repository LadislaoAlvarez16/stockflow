import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    this.logger.error(
      `Prisma Error [${exception.code}]: ${exception.message}`,
      exception.stack,
    );

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Error interno al procesar la solicitud en la base de datos';
    let errorType = 'Internal Server Error';

    switch (exception.code) {
      case 'P2002':
        status = HttpStatus.CONFLICT;
        message = 'Registro duplicado o conflicto de restricción única';
        errorType = 'Conflict';
        break;
      case 'P2025':
        status = HttpStatus.NOT_FOUND;
        message = 'El recurso solicitado no existe';
        errorType = 'Not Found';
        break;
    }

    response.status(status).json({
      statusCode: status,
      message: message,
      error: errorType,
    });
  }
}
