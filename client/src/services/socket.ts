import { io, Socket } from 'socket.io-client';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL 
  ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api$/, '') 
  : 'https://arcadeverse-backend.onrender.com';

class SocketService {
  private socket: Socket | null = null;
  private listeners = new Map<string, Set<(...args: any[]) => void>>();

  public connect(token: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve(this.socket);
        return;
      }

      this.socket = io(BACKEND_URL, {
        auth: { token },
        transports: ['websocket'],
      });

      this.socket.on('connect', () => {
        console.log('Socket connected to backend');
        // Re-attach listeners
        this.listeners.forEach((fns, event) => {
          fns.forEach(fn => this.socket?.on(event, fn));
        });
        resolve(this.socket!);
      });

      this.socket.on('connect_error', (err) => {
        console.warn('Socket connection failed, running in local/fallback mode:', err);
        // Resolve instead of reject to prevent unhandled rejection overlays in dev
        resolve(this.socket!);
      });
    });
  }

  public disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  public getSocket(): Socket | null {
    return this.socket;
  }

  public on(event: string, callback: (...args: any[]) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  public off(event: string, callback?: (...args: any[]) => void) {
    if (!callback) {
      this.listeners.delete(event);
      if (this.socket) {
        this.socket.off(event);
      }
    } else {
      const fns = this.listeners.get(event);
      if (fns) {
        fns.delete(callback);
        if (fns.size === 0) {
          this.listeners.delete(event);
        }
      }
      if (this.socket) {
        this.socket.off(event, callback);
      }
    }
  }

  public emit(event: string, data?: any) {
    if (this.socket) {
      this.socket.emit(event, data);
    } else {
      console.warn(`Socket not connected. Cannot emit event: ${event}`);
    }
  }
}

export const socketService = new SocketService();
export default socketService;
