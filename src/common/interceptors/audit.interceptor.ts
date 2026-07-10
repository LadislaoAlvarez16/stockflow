import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    // Solo loggear mutaciones
    if (['GET', 'OPTIONS', 'HEAD'].includes(method)) {
      return next.handle();
    }

    const userId = request.user?.sub || request.user?.id;
    const url = request.originalUrl;
    const body = request.body;
    
    // Acción genérica
    const action = `HTTP_${method}_${url}`;

    return next.handle().pipe(
      tap(() => {
        // Solo entra aquí si el request HTTP fue exitoso (no tiró Exception)
        if (userId) {
          this.auditService.log({
            userId,
            action,
            metadata: { body },
          });
        }
      }),
    );
  }
}
