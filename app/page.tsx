'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function Home() {
  const [url, setUrl] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'converting' | 'finished' | 'error'>('idle');
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const handleConvert = async () => {
    if (!url.trim()) {
      setError('Please enter a YouTube URL');
      return;
    }

    setStatus('converting');
    setError(null);
    setFileUrl(null);
    
    try {
      const convertRes = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, format: 'mp3' }),
      });
      if (!convertRes.ok) throw new Error((await convertRes.json()).error);
      const { task_id } = await convertRes.json();
      setTaskId(task_id);
      pollStatus(task_id);
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    }
  };

  const pollStatus = async (id: string) => {
    const res = await fetch(`/api/status/${id}`);
    if (!res.ok) return setError('Failed to get status');
    const { status: taskStatus, file_url, progress } = await res.json();
    setProgress(progress || 0);
    if (taskStatus === 'finished') {
      setFileUrl(file_url);
      setStatus('finished');
    } else if (taskStatus === 'error') {
      setError('Conversion failed');
      setStatus('error');
    } else {
      setTimeout(() => pollStatus(id), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50">
      {/* Header */}
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-7xl font-bold text-gray-900 mb-6">
            Convert Any
          </h1>
          <h1 className="text-5xl md:text-7xl font-bold mb-6">
            <span className="text-blue-900">YouTube</span> to{' '}
            <span className="text-orange-500">MP3</span>
          </h1>
          <p className="text-xl text-gray-600 mb-4 max-w-4xl mx-auto">
            Download high-quality MP3 audio from YouTube videos in seconds.
          </p>
          <p className="text-xl text-gray-600 max-w-4xl mx-auto">
            The perfect tool for music lovers, content creators, and audio enthusiasts.
          </p>
        </div>

        {/* Main Converter */}
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="flex-1">
                <Input
                  type="text"
                  placeholder="https://youtube.com/watch?v=..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="h-14 text-lg border-2 border-gray-200 focus:border-orange-500 rounded-xl"
                />
              </div>
              <Button 
                onClick={handleConvert} 
                disabled={status === 'converting'}
                className="h-14 px-8 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl text-lg"
              >
                {status === 'converting' ? 'Converting...' : '🎵 Convert to MP3'}
              </Button>
            </div>

            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {status === 'converting' && (
              <div className="mb-6">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Converting your video...</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            {status === 'finished' && fileUrl && (
              <div className="border-2 border-green-200 bg-green-50 rounded-xl p-6">
                <div className="text-center mb-4">
                  <h3 className="text-xl font-semibold text-green-800 mb-2">✅ Conversion Complete!</h3>
                  <p className="text-green-600">Your MP3 is ready for download</p>
                </div>
                
                <audio controls src={fileUrl} className="w-full mb-4" />
                
                <a href={fileUrl} download className="block">
                  <Button className="w-full h-12 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl">
                    📥 Download MP3
                  </Button>
                </a>
                
                <p className="text-sm text-gray-500 text-center mt-3">
                  File expires in 24 hours
                </p>
              </div>
            )}
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div className="bg-white rounded-xl p-6 shadow-lg">
              <div className="text-4xl mb-4">⚡</div>
              <h3 className="text-xl font-semibold mb-2">Lightning Fast</h3>
              <p className="text-gray-600">Convert videos to MP3 in seconds with our optimized processing</p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-lg">
              <div className="text-4xl mb-4">🎵</div>
              <h3 className="text-xl font-semibold mb-2">High Quality</h3>
              <p className="text-gray-600">Get the best audio quality from your favorite YouTube videos</p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-lg">
              <div className="text-4xl mb-4">🔒</div>
              <h3 className="text-xl font-semibold mb-2">Safe & Secure</h3>
              <p className="text-gray-600">Your files are automatically deleted after 24 hours</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
