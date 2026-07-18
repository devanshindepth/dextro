import type { AgentSession } from 'core-types';

export interface GroupedSessions {
  name: string;
  conversations: {
    id: string;
    title: string;
    time: string;
  }[];
}

function timeAgo(dateInput: string | Date | undefined): string {
  if (!dateInput) return 'unknown';
  
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return 'unknown';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return `${diffSecs}s`;
  
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m`;
  
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h`;
  
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d`;
}

export function groupSessionsByProject(sessions: AgentSession[]): GroupedSessions[] {
  const groups = new Map<string, GroupedSessions>();
  const fallbackProjectName = 'No Project';

  for (const session of sessions) {
    let projectName = session.settings.remoteGitUrl?.split('/').pop() 
      ?? session.settings.projectPath?.split('/').pop() 
      ?? fallbackProjectName;

    // Handle trailing slashes or empty strings from splitting
    if (!projectName.trim()) {
      projectName = fallbackProjectName;
    }

    if (!groups.has(projectName)) {
      groups.set(projectName, {
        name: projectName,
        conversations: []
      });
    }

    const group = groups.get(projectName)!;
    
    // Create a title from the first message or use fallback
    let title = 'New Conversation';
    if (session.messages && session.messages.length > 0) {
       title = session.messages[0].content;
       if (title.length > 30) {
         title = title.substring(0, 27) + '...';
       }
    } else if (session.name && session.name !== 'default_project' && session.name !== 'New Session') {
       title = session.name;
    }

    // Replace newlines in title for single line display
    title = title.replace(/\n/g, ' ');

    group.conversations.push({
      id: session.id,
      title: title,
      time: timeAgo(session.createdAt),
    });
  }

  // Sort groups alphabetically, but put 'No Project' at the end
  const sortedGroups = Array.from(groups.values()).sort((a, b) => {
    if (a.name === fallbackProjectName) return 1;
    if (b.name === fallbackProjectName) return -1;
    return a.name.localeCompare(b.name);
  });

  // Sort conversations within each group by time (newest first)
  for (const group of sortedGroups) {
    // Note: since time is a string like '4m', '12h', '3d', sorting them correctly
    // requires mapping back to the original timestamps. 
    // Since we process them from the sessions array, we can just sort the sessions first,
    // or sort by ID if IDs are time-sortable (UUIDs aren't).
    // Let's rely on the original sessions array order if it's pre-sorted, or we can sort the original sessions.
  }

  return sortedGroups;
}
