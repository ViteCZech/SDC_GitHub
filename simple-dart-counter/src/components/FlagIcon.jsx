const FlagIcon = ({ lang }) => {
  if (lang === 'cs')
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600" className="w-5 h-3.5 rounded-sm object-cover">
        <rect width="900" height="600" fill="#D7141A" />
        <rect width="900" height="300" fill="#FFF" />
        <polygon points="0,0 0,600 450,300" fill="#11457E" />
      </svg>
    );
  if (lang === 'en')
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30" className="w-5 h-3.5 rounded-sm object-cover">
        <clipPath id="t">
          <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
        </clipPath>
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#t)" stroke="#C8102E" strokeWidth="4" />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
      </svg>
    );
  if (lang === 'pl')
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 10"
        className="w-5 h-3.5 rounded-sm object-cover border border-slate-700/50"
      >
        <rect width="16" height="10" fill="#fff" />
        <rect width="16" height="5" y="5" fill="#dc143c" />
      </svg>
    );
  return null;
};

export default FlagIcon;
