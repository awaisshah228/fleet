import { Inject, Logger, UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Namespace } from 'socket.io';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

import { SocketWithAuth } from 'src/types';
import { ChatService } from './chat.service';
import { RoomRepository } from './repositories';
import { WsBadRequestException } from 'src/exceptions';
import { UserRepository } from 'src/user/user.repository';
import { WsCatchAllFilter } from 'src/exceptions/ws-catch-all-filter';
import { CreatePrivateMessageDto, CreatePublicRoomDto, JoinRoomDto } from './dto';

// FIXME: Fix Response Messages

@UsePipes(new ValidationPipe())
@UseFilters(new WsCatchAllFilter())
@WebSocketGateway({
  namespace: 'chat',
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly chatService: ChatService,
    private readonly userRepository: UserRepository,
    public readonly roomRepository: RoomRepository,
  ) {}
  @WebSocketServer() server: Namespace; // Used Namespace to separate the logic of chat namespace

  afterInit(): void {
    this.logger.log('Chat Gateway initialized');
  }

  async handleConnection(client: SocketWithAuth) {
    // When user connects
    // Cache => key: user.id, value: socketId
    await this.cacheManager.store.set(client.userID, client.id);
    const userRooms = await this.chatService.findMyRooms(client.userID);

    // User joins all rooms he is member of,
    // so he can send messages immediately. Becomes "Online"
    this.chatService.initJoin(userRooms, client);

    this.logger.log(`user: ${client.username} is now online!`);
    this.logger.debug(
      `WS client with id: ${client.userID}, ${client.username} connected.\nNumber of connected clients ${this.server.sockets.size}`,
    );
  }

  async handleDisconnect(client: SocketWithAuth) {
    // When user disconnects
    // delete the socketId from the cache
    await this.cacheManager.del(client.userID);

    this.logger.log(`user: ${client.username} is now offline!`);
    this.logger.debug(`Number of connected clients ${this.server.sockets.size}`);
  }

  @SubscribeMessage('createNewPublicRoom') // FIXME: Switch to Http
  async handleCreateNewPublicRoom(client: SocketWithAuth, payload: CreatePublicRoomDto) {
    const isRoom = await this.chatService.isRoomExist(payload);
    if (isRoom) {
      throw new WsBadRequestException('room is already exist');
    }

    const room = await this.chatService.createPublicRoom(payload);
    client.join(room.name);

    const answerPayload = {
      status: 'success',
      message: 'new room created',
      data: { room: room.name },
    };
    this.server.to(room.name).emit('createNewPublicRoom', answerPayload);
  }

  @SubscribeMessage('join_pub_room')
  async handleJoinRoom(
    @ConnectedSocket() client: SocketWithAuth,
    @MessageBody() payload: JoinRoomDto,
  ) {
    const room = await this.chatService.findRoomByName(payload);

    if (!room) {
      throw new WsBadRequestException('room not found');
    }

    const user = await this.userRepository.findById(client.userID);

    const isJoined = this.chatService.joinRoom(room, user);
    if (!isJoined) {
      client.emit('not joined');
    }
    client.join(room.name);

    const answerPayload = { name: client.email, text: 'new user joined' };

    this.server.to(room.name).emit('user_joined_pub_room', answerPayload);
  }

  // FIXME: Currently not working
  // @SubscribeMessage('getRooms')
  // async handleGetRooms(@ConnectedSocket() client: SocketWithAuth, _payload) {
  //   const rooms = await this.chatService.findMyRooms();

  //   // FIXME:
  //   console.log(rooms);
  //   client.emit('getRooms', [...rooms]);
  // }

  @SubscribeMessage('msg_priv_to_server')
  async handlePrivateMessage(client: SocketWithAuth, payload: CreatePrivateMessageDto) {
    // Save the message in the db and populate the private room data
    const createdMessage = await this.chatService.createPrivateMessage(client.userID, payload);

    // Response object
    const answerPayload = { name: client.email, text: createdMessage.message }; // FIXME: Add appropriate response

    // Fetch receiver socketID from the cache
    const receiverSocketId: string = await this.cacheManager.store.get(payload.receiver);

    // Fetch the receiver socket and
    // join the two clients to their private room
    const receiverSocketObject = await this.server.sockets.get(receiverSocketId);
    await receiverSocketObject.join(createdMessage.room.name);
    await client.join(createdMessage.room.name);

    // if receiver is online
    if (receiverSocketId) {
      this.server.to(createdMessage.room.name).emit('msg_priv_to_client', answerPayload);
    }
  }
}
