import type { RoomTemplate } from '@codraft/shared'

interface TemplateDef {
  label: string
  icon: string
  sections: string[]
}

export const TEMPLATES: Record<RoomTemplate, TemplateDef> = {
  trip: {
    label: 'Trip Planning',
    icon: '✈️',
    sections: ['Overview', 'Itinerary', 'Hotels', 'Budget', 'Restaurants', 'Packing List', 'Notes'],
  },
  meeting: {
    label: 'Meeting',
    icon: '📋',
    sections: ['Agenda', 'Attendees', 'Discussion Points', 'Decisions', 'Action Items', 'Next Steps'],
  },
  project: {
    label: 'Project Plan',
    icon: '🚀',
    sections: ['Goals', 'Requirements', 'Timeline', 'Team', 'Decisions', 'Blocklist'],
  },
  research: {
    label: 'Research',
    icon: '🔬',
    sections: ['Summary', 'Key Findings', 'Sources', 'Open Questions', 'Conclusions'],
  },
  brainstorm: {
    label: 'Brainstorm',
    icon: '💡',
    sections: ['Problem Statement', 'Ideas', 'Top Picks', 'Next Steps'],
  },
  custom: {
    label: 'Custom',
    icon: '📄',
    sections: ['Overview', 'Notes'],
  },
}

export function detectTemplate(roomName: string): RoomTemplate {
  const name = roomName.toLowerCase()
  if (name.includes('trip') || name.includes('travel') || name.includes('vacation') || name.includes('holiday'))
    return 'trip'
  if (name.includes('meeting') || name.includes('standup') || name.includes('sync')) return 'meeting'
  if (name.includes('project') || name.includes('sprint') || name.includes('roadmap')) return 'project'
  if (name.includes('research') || name.includes('study') || name.includes('analysis')) return 'research'
  if (name.includes('brainstorm') || name.includes('ideas') || name.includes('ideation')) return 'brainstorm'
  return 'custom'
}
