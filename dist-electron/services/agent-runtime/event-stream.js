"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAgentRuntimeEventEmitter = createAgentRuntimeEventEmitter;
const node_crypto_1 = require("node:crypto");
function createAgentRuntimeEventEmitter(sink, turnId = (0, node_crypto_1.randomUUID)(), now = () => new Date()) {
    let sequence = 0;
    return {
        turnId,
        emit(event) {
            const enriched = {
                ...event,
                turnId,
                sequence: sequence++,
                timestamp: now().toISOString(),
            };
            sink?.(enriched);
            return enriched;
        },
    };
}
//# sourceMappingURL=event-stream.js.map