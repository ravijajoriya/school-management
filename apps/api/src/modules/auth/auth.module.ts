import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import { UserAccessService } from './user-access.service.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, UserAccessService],
  exports: [PasswordService, TokenService, UserAccessService],
})
export class AuthModule {}
