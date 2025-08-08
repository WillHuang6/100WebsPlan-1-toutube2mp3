import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    vercel: process.env.VERCEL,
    rapidapi_key_exists: !!process.env.RAPIDAPI_KEY,
    rapidapi_key_length: process.env.RAPIDAPI_KEY?.length || 0,
    rapidapi_key_preview: process.env.RAPIDAPI_KEY ? 
      `${process.env.RAPIDAPI_KEY.substring(0, 8)}...${process.env.RAPIDAPI_KEY.slice(-4)}` : 
      'not found'
  });
}