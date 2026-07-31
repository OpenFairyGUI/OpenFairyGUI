import { probeRasterImage } from './utils/image-info.js';

const scope = globalThis as unknown as {
	addEventListener(type: 'message', listener: (event: MessageEvent<ArrayBuffer>) => void): void;
	postMessage(message: ReturnType<typeof probeRasterImage>): void;
};

scope.addEventListener('message', (event) => {
	scope.postMessage(event.data instanceof ArrayBuffer ? probeRasterImage(new Uint8Array(event.data)) : null);
});
