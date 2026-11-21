import { Module } from '@nestjs/common';
import { ClassesController, EnquiriesController } from './enquiries.controller.js';
import { EnquiriesService } from './enquiries.service.js';

@Module({
  controllers: [EnquiriesController, ClassesController],
  providers: [EnquiriesService],
  exports: [EnquiriesService],
})
export class AdmissionsModule {}
