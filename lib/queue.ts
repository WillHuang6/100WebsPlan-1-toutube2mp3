// 🚀 高性能并发处理队列

interface QueueItem {
  id: string;
  url: string;
  format: string;
  priority: number;
  createdAt: number;
  retryCount: number;
}

interface QueueStats {
  active: number;
  pending: number;
  completed: number;
  failed: number;
  totalProcessed: number;
}

class ConversionQueue {
  private queue: QueueItem[] = [];
  private processing = new Set<string>();
  private readonly maxConcurrent: number;
  private readonly maxRetries: number;
  private stats: QueueStats = {
    active: 0,
    pending: 0,
    completed: 0,
    failed: 0,
    totalProcessed: 0
  };

  constructor(maxConcurrent = 3, maxRetries = 2) {
    this.maxConcurrent = maxConcurrent;
    this.maxRetries = maxRetries;
  }

  // 添加任务到队列
  add(item: Omit<QueueItem, 'createdAt' | 'retryCount' | 'priority'>): void {
    const queueItem: QueueItem = {
      ...item,
      priority: 1, // 默认优先级
      createdAt: Date.now(),
      retryCount: 0
    };

    // 检查是否已经在队列中
    const existing = this.queue.find(i => i.url === item.url);
    if (existing) {
      console.log(`⚠️ URL ${item.url} 已在队列中`);
      return;
    }

    this.queue.push(queueItem);
    this.stats.pending++;
    this.sortQueue();
    
    console.log(`➕ 任务 ${item.id} 已添加到队列 (队列长度: ${this.queue.length})`);
    
    // 尝试处理队列
    this.processQueue();
  }

  // 按优先级和创建时间排序队列
  private sortQueue(): void {
    this.queue.sort((a, b) => {
      // 优先级高的优先处理
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // 同优先级按创建时间排序
      return a.createdAt - b.createdAt;
    });
  }

  // 处理队列
  private async processQueue(): Promise<void> {
    // 检查是否可以处理更多任务
    if (this.processing.size >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.processing.add(item.id);
    this.stats.active++;
    this.stats.pending--;

    console.log(`🚀 开始处理任务 ${item.id} (并发: ${this.processing.size}/${this.maxConcurrent})`);

    try {
      // 这里调用实际的转换逻辑
      await this.processItem(item);
      
      this.stats.completed++;
      this.stats.totalProcessed++;
      console.log(`✅ 任务 ${item.id} 处理完成`);
      
    } catch (error) {
      console.error(`💥 任务 ${item.id} 处理失败:`, error);
      
      // 重试逻辑
      if (item.retryCount < this.maxRetries) {
        item.retryCount++;
        item.priority += 1; // 增加优先级
        this.queue.unshift(item); // 放回队列开头
        this.stats.pending++;
        console.log(`🔄 任务 ${item.id} 将重试 (${item.retryCount}/${this.maxRetries})`);
      } else {
        this.stats.failed++;
        this.stats.totalProcessed++;
        console.log(`❌ 任务 ${item.id} 重试次数耗尽`);
      }
    } finally {
      this.processing.delete(item.id);
      this.stats.active--;
      
      // 处理下一个任务
      setImmediate(() => this.processQueue());
    }
  }

  // 实际处理单个任务（这里需要与convert API集成）
  private async processItem(item: QueueItem): Promise<void> {
    // 这里应该调用实际的转换逻辑
    // 暂时用延迟模拟处理时间
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 模拟随机失败
    if (Math.random() < 0.1) {
      throw new Error('模拟处理失败');
    }
  }

  // 获取队列状态
  getStats(): QueueStats & { queueLength: number; processingIds: string[] } {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      processingIds: Array.from(this.processing)
    };
  }

  // 获取任务状态
  getTaskStatus(id: string): 'queued' | 'processing' | 'completed' | 'failed' | 'not_found' {
    if (this.processing.has(id)) return 'processing';
    if (this.queue.some(item => item.id === id)) return 'queued';
    // 这里需要检查已完成和失败的任务（可以用另一个存储）
    return 'not_found';
  }

  // 清理过期任务
  cleanup(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24小时
    
    const originalLength = this.queue.length;
    this.queue = this.queue.filter(item => now - item.createdAt < maxAge);
    
    const removed = originalLength - this.queue.length;
    if (removed > 0) {
      this.stats.pending -= removed;
      console.log(`🧹 清理了 ${removed} 个过期任务`);
    }
  }

  // 暂停处理
  pause(): void {
    console.log('⏸️ 队列处理已暂停');
  }

  // 恢复处理
  resume(): void {
    console.log('▶️ 队列处理已恢复');
    this.processQueue();
  }
}

// 导出单例队列实例
export const conversionQueue = new ConversionQueue(
  parseInt(process.env.MAX_CONCURRENT_CONVERSIONS || '3'),
  parseInt(process.env.MAX_RETRIES || '2')
);

// 定期清理过期任务
setInterval(() => {
  conversionQueue.cleanup();
}, 60 * 60 * 1000); // 每小时清理一次