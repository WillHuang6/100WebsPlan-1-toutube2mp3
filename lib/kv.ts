import { createClient, RedisClientType } from 'redis';

let client: RedisClientType | null = null;

async function getRedisClient(): Promise<RedisClientType> {
  if (!client) {
    client = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 500), // 重连策略
        connectTimeout: 5000 // 5秒连接超时
      }
    });

    // 添加错误处理
    client.on('error', (err) => {
      console.error('Redis client error:', err);
    });

    client.on('connect', () => {
      console.log('✅ Redis connected');
    });

    client.on('reconnecting', () => {
      console.log('🔄 Redis reconnecting...');
    });

    await client.connect();
  }
  return client;
}

export interface Task {
  id: string;
  status: string;
  file_url?: string;
  progress?: number;
  error?: string;
  title?: string;
  createdAt: number;
}

export class TaskStore {
  private static readonly TASK_PREFIX = 'task:';
  private static readonly TASK_TTL = 24 * 60 * 60; // 24 hours in seconds

  static async set(taskId: string, task: Omit<Task, 'id'>): Promise<void> {
    const fullTask: Task = {
      id: taskId,
      ...task,
      createdAt: task.createdAt || Date.now()
    };
    
    const redis = await getRedisClient();
    await redis.setEx(
      `${this.TASK_PREFIX}${taskId}`,
      this.TASK_TTL,
      JSON.stringify(fullTask)
    );
  }

  static async get(taskId: string): Promise<Task | null> {
    const redis = await getRedisClient();
    const result = await redis.get(`${this.TASK_PREFIX}${taskId}`);
    return result ? JSON.parse(result) : null;
  }

  static async delete(taskId: string): Promise<void> {
    const redis = await getRedisClient();
    await redis.del(`${this.TASK_PREFIX}${taskId}`);
  }

  static async update(taskId: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<Task | null> {
    const existingTask = await this.get(taskId);
    if (!existingTask) {
      return null;
    }

    const updatedTask: Task = {
      ...existingTask,
      ...updates
    };

    await this.set(taskId, updatedTask);
    return updatedTask;
  }

  static async exists(taskId: string): Promise<boolean> {
    const redis = await getRedisClient();
    const exists = await redis.exists(`${this.TASK_PREFIX}${taskId}`);
    return exists === 1;
  }
}