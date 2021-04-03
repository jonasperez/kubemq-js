"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Client = void 0;
const kubemq = require("./protos");
const grpc = require("@grpc/grpc-js");
const defaultOptions = {
    address: 'localhost:50000',
    dialTimeout: 30000,
};
class Client {
    constructor(Options) {
        this.clientOptions = Object.assign(Object.assign({}, defaultOptions), Options);
        this.init();
    }
    init() {
        this.grpcClient = new kubemq.kubemqClient(this.clientOptions.address, this.getChannelCredentials());
    }
    metadata() {
        const meta = new grpc.Metadata();
        if (this.clientOptions.authToken != null) {
            meta.add('authorization', this.clientOptions.authToken);
        }
        return meta;
    }
    callOptions() {
        return {
            deadline: new Date(Date.now() + this.clientOptions.dialTimeout),
        };
    }
    getChannelCredentials() {
        if (this.clientOptions.credentials != null) {
            return grpc.credentials.createSsl(this.clientOptions.credentials.rootCertificate, null, this.clientOptions.credentials.certChain);
        }
        else {
            return grpc.credentials.createInsecure();
        }
    }
    ping() {
        return new Promise((resolve, reject) => {
            this.grpcClient.ping(new kubemq.Empty(), (e, res) => {
                if (e) {
                    reject(e);
                    return;
                }
                const serverInfo = {
                    host: res.getHost(),
                    version: res.getVersion(),
                    serverStartTime: res.getServerstarttime(),
                    serverUpTimeSeconds: res.getServeruptimeseconds(),
                };
                resolve(serverInfo);
            });
        });
    }
    close() {
        this.grpcClient.close();
    }
}
exports.Client = Client;
//# sourceMappingURL=client.js.map