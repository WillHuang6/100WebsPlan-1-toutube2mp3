import { kv } from '@vercel/kv';

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
    
    await kv.setex(
      `${this.TASK_PREFIX}${taskId}`,
      this.TASK_TTL,
      JSON.stringify(fullTask)
    );
  }

  static async get(taskId: string): Promise<Task | null> {
    const result = await kv.get<string>(`${this.TASK_PREFIX}${taskId}`);
    return result ? JSON.parse(result) : null;
  }

  static async delete(taskId: string): Promise<void> {
    await kv.del(`${this.TASK_PREFIX}${taskId}`);
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
    const exists = await kv.exists(`${this.TASK_PREFIX}${taskId}`);
    return exists === 1;
  }
}