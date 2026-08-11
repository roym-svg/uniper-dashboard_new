export function isStatusFaulty(status) {
  if (!status) return false;
  return status.includes('נאסף מניתוק') || status.includes('תקול');
}

export function getStatusMeta(status) {
  const isFaulty = isStatusFaulty(status);
  
  let color = 'green';
  if (status && status.includes('נאסף מניתוק')) {
    color = 'amber';
  } else if (status && status.includes('בדרך')) {
    color = 'blue';
  } else if (status && (status.includes('מחסן') || status.includes('משרד'))) {
    color = 'purple';
  }

  return {
    isFaulty,
    label: status || 'אצל המדריך',
    color
  };
}