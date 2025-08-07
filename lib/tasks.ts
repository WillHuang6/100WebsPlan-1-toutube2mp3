import { TaskStore, Task } from './kv';

// Keep the original interface for backward compatibility
export interface TaskData {
  status: string;
  file_url?: string;
  progress?: number;
  error?: string;
  audioStream?: any;
  audioBuffer?: Buffer;
  title?: string;
}

// Legacy Map for in-memory storage (fallback/development)
export const tasks = new Map<string, TaskData>();

// New KV-based task management
export const taskManager = {
  async create(taskId: string, taskData: Omit<TaskData, 'audioStream' | 'audioBuffer'>): Promise<void> {
    // Store in KV (without non-serializable data)
    await TaskStore.set(taskId, {
      ...taskData,
      createdAt: Date.now()
    });
    
    // Also store in memory map for audioStream/audioBuffer if needed
    tasks.set(taskId, taskData);
  },

  async get(taskId: string): Promise<TaskData | null> {
    // First try to get from KV
    const kvTask = await TaskStore.get(taskId);
    if (kvTask) {
      // Merge with memory data if exists (for audioStream/audioBuffer)
      const memoryTask = tasks.get(taskId);
      return {
        ...kvTask,
        ...(memoryTask?.audioStream && { audioStream: memoryTask.audioStream }),
        ...(memoryTask?.audioBuffer && { audioBuffer: memoryTask.audioBuffer })
      };
    }
    
    // Fallback to memory
    return tasks.get(taskId) || null;
  },

  async update(taskId: string, updates: Partial<TaskData>): Promise<TaskData | null> {
    // Update KV (exclude non-serializable data)
    const { audioStream, audioBuffer, ...serializableUpdates } = updates;
    const updatedTask = await TaskStore.update(taskId, serializableUpdates);
    
    // Update memory for non-serializable data
    if (audioStream || audioBuffer) {
      const existingMemoryTask = tasks.get(taskId) || {};
      tasks.set(taskId, {
        ...existingMemoryTask,
        ...(audioStream && { audioStream }),
        ...(audioBuffer && { audioBuffer })
      });
    }
    
    return updatedTask;
  },

  async delete(taskId: string): Promise<void> {
    await TaskStore.delete(taskId);
    tasks.delete(taskId);
  },

  async exists(taskId: string): Promise<boolean> {
    return await TaskStore.exists(taskId);
  }
}; 