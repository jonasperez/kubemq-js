import { BaseMessage, Client, StreamState } from './client';
import { Config } from './config';
import * as pb from '../src/protos';
import { Utils } from './utils';
import { TypedEvent } from './common';
import { Empty } from './protos';

export interface CommandsMessage extends BaseMessage {
  timeout?: number;
}
export interface CommandsReceiveMessage {
  id: string;
  channel: string;
  metadata: string;
  body: Uint8Array | string;
  tags: Map<string, string>;
  replyChannel: string;
}

export interface CommandsResponse {
  id: string;
  replyChannel?: string;
  clientId: string;
  timestamp: number;
  executed: boolean;
  error: string;
}

export interface CommandsSubscriptionRequest {
  channel: string;
  group?: string;
  clientId?: string;
}

export interface CommandsSubscriptionResponse {
  state: StreamState;
  onCommand: TypedEvent<CommandsReceiveMessage>;
  onError: TypedEvent<Error>;
  onStateChanged: TypedEvent<StreamState>;
  cancel(): void;
}

export class CommandsClient extends Client {
  constructor(Options: Config) {
    super(Options);
  }

  public send(message: CommandsMessage): Promise<CommandsResponse> {
    const pbMessage = new pb.Request();
    pbMessage.setRequestid(message.id ? message.id : Utils.uuid());
    pbMessage.setClientid(
      message.clientId ? message.clientId : this.clientOptions.clientId,
    );
    pbMessage.setChannel(message.channel);
    pbMessage.setReplychannel(message.channel);
    pbMessage.setBody(message.body);
    pbMessage.setMetadata(message.metadata);
    if (message.tags != null) {
      pbMessage.getTagsMap().set(message.tags);
    }
    pbMessage.setTimeout(
      message.timeout ? message.timeout : this.clientOptions.defaultRpcTimeout,
    );
    pbMessage.setRequesttypedata(1);

    return new Promise<CommandsResponse>((resolve, reject) => {
      this.grpcClient.sendRequest(pbMessage, this.metadata(), (e, response) => {
        if (e) {
          reject(e);
          return;
        }
        resolve({
          id: response.getRequestid(),
          clientId: response.getClientid(),
          error: response.getError(),
          executed: response.getExecuted(),
          timestamp: response.getTimestamp(),
        });
      });
    });
  }

  public response(message: CommandsResponse): Promise<Empty> {
    const pbMessage = new pb.Response();
    pbMessage.setRequestid(message.id);
    pbMessage.setClientid(
      message.clientId ? message.clientId : this.clientOptions.clientId,
    );
    pbMessage.setReplychannel(message.replyChannel);

    pbMessage.setError(message.error);
    pbMessage.setExecuted(message.executed);
    return new Promise<Empty>((resolve, reject) => {
      this.grpcClient.sendResponse(
        pbMessage,
        this.metadata(),
        (e, response) => {
          if (e) {
            reject(e);
            return;
          }
          resolve(response);
        },
      );
    });
  }

  public subscribe(
    request: CommandsSubscriptionRequest,
  ): CommandsSubscriptionResponse {
    const pbSubRequest = new pb.Subscribe();
    pbSubRequest.setClientid(
      request.clientId ? request.clientId : this.clientOptions.clientId,
    );
    pbSubRequest.setGroup(request.group ? request.group : '');
    pbSubRequest.setChannel(request.channel);
    pbSubRequest.setSubscribetypedata(3);

    const stream = this.grpcClient.subscribeToRequests(
      pbSubRequest,
      this.metadata(),
    );

    let state = StreamState.Initialized;
    let onStateChanged = new TypedEvent<StreamState>();
    let onEvent = new TypedEvent<CommandsReceiveMessage>();
    let onError = new TypedEvent<Error>();

    stream.on('data', function (data: pb.Request) {
      onEvent.emit({
        id: data.getRequestid(),
        channel: data.getChannel(),
        metadata: data.getMetadata(),
        body: data.getBody(),
        tags: data.getTagsMap(),
        replyChannel: data.getReplychannel(),
      });
      if (state !== StreamState.Ready) {
        state = StreamState.Ready;
        onStateChanged.emit(StreamState.Ready);
      }
    });
    stream.on('error', function (e: Error) {
      onError.emit(e);
      if (state !== StreamState.Error) {
        state = StreamState.Error;
        onStateChanged.emit(StreamState.Error);
      }
    });

    stream.on('close', function () {
      if (state !== StreamState.Closed) {
        state = StreamState.Closed;
        onStateChanged.emit(StreamState.Closed);
      }
    });
    return {
      state: state,
      onCommand: onEvent,
      onStateChanged: onStateChanged,
      onError: onError,
      cancel() {
        stream.cancel();
      },
    };
  }
}
