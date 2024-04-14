import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { MessageRepository, RoomRepository } from './repositories';
import { Message, Room } from './entities';
import { EventsModule } from 'src/events/events.module';
import { ChatGateway } from './chat.gateway';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [
    EventsModule,
    TypeOrmModule.forFeature([Message, MessageRepository, Room, RoomRepository]),
    forwardRef(() => UserModule),
  ],
  controllers: [ChatController],
  providers: [MessageRepository, RoomRepository, ChatService, ChatGateway],
  exports: [MessageRepository, RoomRepository],
})
export class ChatModule {}
