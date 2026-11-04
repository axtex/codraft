import { NextRequest } from 'next/server'

export function jsonRequest(url: string, method: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function getRequest(url: string): NextRequest {
  return new NextRequest(url)
}
