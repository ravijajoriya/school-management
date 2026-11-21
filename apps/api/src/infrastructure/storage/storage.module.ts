import { Global, Module } from '@nestjs/common';
import { PrivateFilesService } from './private-files.service.js';
import { StorageService } from './storage.service.js';

@Global()
@Module({
  providers: [StorageService, PrivateFilesService],
  exports: [StorageService, PrivateFilesService],
})
export class StorageModule {}
