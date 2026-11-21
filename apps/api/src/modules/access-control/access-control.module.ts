import { Module } from '@nestjs/common';
import { AccessControlController } from './access-control.controller.js';
import { RolesService } from './roles.service.js';

@Module({
  controllers: [AccessControlController],
  providers: [RolesService],
})
export class AccessControlModule {}
