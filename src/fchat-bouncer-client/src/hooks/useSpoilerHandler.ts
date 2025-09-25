import { useEffect, useRef } from 'react';

/**
 * Hook to handle spoiler and collapse button interactions in BBCode-rendered content
 */
export function useSpoilerHandler() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleButtonClick = (event: Event) => {
      const target = event.target as HTMLElement;
      
      // Handle spoiler buttons
      if (target.classList.contains('spoiler-button')) {
        event.preventDefault();
        event.stopPropagation();
        
        const spoilerId = target.getAttribute('data-spoiler-target');
        if (!spoilerId) return;

        const content = container.querySelector(`[data-spoiler-content="${spoilerId}"]`) as HTMLElement;
        if (!content) return;

        // Toggle visibility
        if (content.style.display === 'none' || content.style.display === '') {
          content.style.display = 'block';
          target.textContent = 'Hide spoiler';
        } else {
          content.style.display = 'none';
          target.textContent = 'Click here for spoiler';
        }
      }
      
      // Handle collapse buttons
      if (target.classList.contains('collapse-button')) {
        event.preventDefault();
        event.stopPropagation();
        
        const collapseId = target.getAttribute('data-collapse-target');
        if (!collapseId) return;

        const content = container.querySelector(`[data-collapse-content="${collapseId}"]`) as HTMLElement;
        if (!content) return;

        // Toggle visibility
        if (content.style.display === 'none' || content.style.display === '') {
          content.style.display = 'block';
          target.innerHTML = '▲ ' + target.innerHTML.replace('▼ ', '').replace('▲ ', '');
        } else {
          content.style.display = 'none';
          target.innerHTML = '▼ ' + target.innerHTML.replace('▼ ', '').replace('▲ ', '');
        }
      }
    };

    // Add event listener to the container
    container.addEventListener('click', handleButtonClick);

    // Cleanup
    return () => {
      container.removeEventListener('click', handleButtonClick);
    };
  }, []);

  return containerRef;
}
