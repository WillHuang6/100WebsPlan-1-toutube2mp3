// 错误监控工具函数

export interface ErrorInfo {
  message: string;
  stack?: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  userAgent?: string;
  timestamp: string;
  errorType: 'javascript' | 'api' | 'conversion' | '404' | 'network';
}

export function trackError(error: Error | string, errorType: ErrorInfo['errorType'], additionalData?: Record<string, any>) {
  const errorInfo: ErrorInfo = {
    message: typeof error === 'string' ? error : error.message,
    stack: typeof error === 'object' ? error.stack : undefined,
    url: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof window !== 'undefined' ? navigator.userAgent : '',
    timestamp: new Date().toISOString(),
    errorType,
    ...additionalData,
  };

  // 发送到GA4
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('event', 'error_tracked', {
      event_category: 'Error_Monitoring',
      event_label: errorInfo.message,
      error_type: errorType,
      error_url: errorInfo.url,
      custom_data: JSON.stringify(additionalData || {}),
    });
  }

  // 可以添加其他错误监控服务
  // 比如 Sentry, LogRocket 等
  console.error('Error tracked:', errorInfo);
  
  return errorInfo;
}

export function trackApiError(endpoint: string, statusCode: number, errorMessage: string) {
  return trackError(errorMessage, 'api', {
    api_endpoint: endpoint,
    status_code: statusCode,
  });
}

export function trackConversionError(url: string, errorMessage: string, step: string) {
  return trackError(errorMessage, 'conversion', {
    youtube_url: url,
    conversion_step: step,
  });
}