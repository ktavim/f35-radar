import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ErrorSignalService } from '../errors/error.signal';
import { httpErrorMessage } from '../errors/http-error-message';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const errors = inject(ErrorSignalService);
  return next(req).pipe(
    catchError((err) => {
      if (err instanceof HttpErrorResponse) {
        errors.publish({
          status: err.status,
          message: httpErrorMessage(err) ?? err.message ?? 'Request failed',
          url: req.url,
          at: Date.now()
        });
      }
      return throwError(() => err);
    })
  );
};
