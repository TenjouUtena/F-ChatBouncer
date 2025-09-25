import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Simple health check - just return OK if the server is running
    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'fchat-bouncer-frontend'
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        service: 'fchat-bouncer-frontend',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
