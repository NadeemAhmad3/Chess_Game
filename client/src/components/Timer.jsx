// client/vite-project/src/components/Timer.jsx
import { useState, useEffect, useRef } from 'react';
import './Timer.css';
import { playLowTimeSound, initSounds } from '../utils/soundEffects';

/**
 * Timer component for the chess application
 *
 * @param {Object} props - Component props
 * @param {number} props.timeWhite - Time remaining for white player in seconds
 * @param {number} props.timeBlack - Time remaining for black player in seconds
 * @param {string} props.currentTurnColor - Current turn color ('white' or 'black')
 * @param {string} props.playerColor - Player's color ('white', 'black', or 'spectator')
 * @param {boolean} props.isSpectating - Whether the user is spectating the game
 */
const Timer = ({ timeWhite, timeBlack, currentTurnColor, playerColor, isSpectating }) => {
  // Use state to track the client-side timers
  const [clientTimeWhite, setClientTimeWhite] = useState(timeWhite);
  const [clientTimeBlack, setClientTimeBlack] = useState(timeBlack);

  // Use refs to store the latest prop values
  const timeWhiteRef = useRef(timeWhite);
  const timeBlackRef = useRef(timeBlack);
  const currentTurnColorRef = useRef(currentTurnColor);

  // Timer interval ref
  const timerIntervalRef = useRef(null);

  // Refs for tracking sound alerts
  const lastSoundAlertTimeRef = useRef(0);
  const soundAlertIntervalRef = useRef(null);

  // Initialize sounds on component mount
  useEffect(() => {
    // Initialize sound effects
    initSounds();

    return () => {
      // Clean up any sound alert intervals
      if (soundAlertIntervalRef.current) {
        clearInterval(soundAlertIntervalRef.current);
      }
    };
  }, []);

  // Update refs when props change
  useEffect(() => {
    // CRITICAL FIX: Log the previous values for debugging
    console.log(`Timer props updating - Previous values: White: ${timeWhiteRef.current?.toFixed(1) || 'N/A'}s, Black: ${timeBlackRef.current?.toFixed(1) || 'N/A'}s, Turn: ${currentTurnColorRef.current || 'N/A'}`);
    console.log(`Timer props updating - New values: White: ${timeWhite.toFixed(1)}s, Black: ${timeBlack.toFixed(1)}s, Turn: ${currentTurnColor}`);

    // Check if the turn has changed
    const turnChanged = currentTurnColorRef.current !== currentTurnColor;

    // CRITICAL FIX: Check if the time values have changed significantly
    const whiteTimeChanged = Math.abs((timeWhiteRef.current || 0) - timeWhite) > 0.5;
    const blackTimeChanged = Math.abs((timeBlackRef.current || 0) - timeBlack) > 0.5;

    // Update the refs with the new values
    timeWhiteRef.current = timeWhite;
    timeBlackRef.current = timeBlack;
    currentTurnColorRef.current = currentTurnColor;

    // Update client-side timers when server values change
    setClientTimeWhite(timeWhite);
    setClientTimeBlack(timeBlack);

    console.log(`Timer props updated - White: ${timeWhite.toFixed(1)}s, Black: ${timeBlack.toFixed(1)}s, Turn: ${currentTurnColor}`);

    // If the turn has changed, log a clear message
    if (turnChanged) {
      console.log(`TURN CHANGED: Now it's ${currentTurnColor}'s turn`);
    }

    // If the time values have changed significantly, log a clear message
    if (whiteTimeChanged) {
      console.log(`WHITE TIME CHANGED SIGNIFICANTLY: ${(timeWhiteRef.current || 0).toFixed(1)}s -> ${timeWhite.toFixed(1)}s`);
    }

    if (blackTimeChanged) {
      console.log(`BLACK TIME CHANGED SIGNIFICANTLY: ${(timeBlackRef.current || 0).toFixed(1)}s -> ${timeBlack.toFixed(1)}s`);
    }
  }, [timeWhite, timeBlack, currentTurnColor]);

  // CRITICAL FIX: Use server-provided times with more accurate client-side updates
  useEffect(() => {
    // Clear any existing interval
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      console.log('Timer interval cleared');
    }

    // Log the current turn color and times when they change
    console.log(`Timer setup - Current turn: ${currentTurnColor}, Player color: ${playerColor}`);
    console.log(`Server times - White: ${timeWhite.toFixed(1)}s, Black: ${timeBlack.toFixed(1)}s`);

    // CRITICAL FIX: Always use server-provided times as the source of truth
    setClientTimeWhite(timeWhite);
    setClientTimeBlack(timeBlack);

    // Store the server times in refs for access in the interval
    timeWhiteRef.current = timeWhite;
    timeBlackRef.current = timeBlack;

    // Store when we received these times
    const receivedTime = Date.now();

    // CRITICAL FIX: Log the current turn color for debugging
    console.log(`Setting up timer interval for ${currentTurnColor}'s turn`);

    // Store the current turn color in a variable that won't change during the interval
    const activeColor = currentTurnColor;

    // Set up an interval to update the active timer between server updates
    // This provides a smoother countdown experience
    timerIntervalRef.current = setInterval(() => {
      // Calculate time elapsed since we received the server times (in seconds)
      const elapsed = (Date.now() - receivedTime) / 1000;

      // CRITICAL FIX: Use the stored turn color, not the ref
      // This ensures we're updating the correct timer even if the ref changes
      if (activeColor === 'white') {
        // Update white's timer (decrement by elapsed time)
        const estimatedTime = Math.max(0, timeWhiteRef.current - elapsed);
        setClientTimeWhite(estimatedTime);

        // CRITICAL FIX: Check for timeout on client side
        if (estimatedTime <= 0 && !window.timeoutDetected) {
          console.log('CLIENT-SIDE TIMEOUT DETECTION: White has run out of time!');
          window.timeoutDetected = true;

          // Trigger a custom event to notify the App component
          const timeoutEvent = new CustomEvent('chess-timeout', {
            detail: {
              color: 'white',
              winner: 'black'
            }
          });
          window.dispatchEvent(timeoutEvent);

          // Play timeout sound
          try {
            const audio = new Audio('/timeout.mp3');
            audio.play().catch(e => console.log('Audio play failed:', e));
          } catch (e) {
            console.log('Audio not supported:', e);
          }
        }

        // Play sound alerts for low time
        if (estimatedTime <= 10 && estimatedTime > 0 && activeColor === playerColor) {
          // Only play sound if it's the player's turn and time is low
          const currentTime = Date.now();
          // Play sound at most once per second when time is low
          if (currentTime - lastSoundAlertTimeRef.current >= 1000) {
            playLowTimeSound();
            lastSoundAlertTimeRef.current = currentTime;
          }
        }

        // CRITICAL FIX: Log the timer update occasionally for debugging
        if (Math.floor(elapsed * 10) % 50 === 0) { // Log every ~5 seconds
          console.log(`White timer update: ${estimatedTime.toFixed(1)}s (elapsed: ${elapsed.toFixed(1)}s)`);
        }
      } else if (activeColor === 'black') {
        // Update black's timer (decrement by elapsed time)
        const estimatedTime = Math.max(0, timeBlackRef.current - elapsed);
        setClientTimeBlack(estimatedTime);

        // CRITICAL FIX: Check for timeout on client side
        if (estimatedTime <= 0 && !window.timeoutDetected) {
          console.log('CLIENT-SIDE TIMEOUT DETECTION: Black has run out of time!');
          window.timeoutDetected = true;

          // Trigger a custom event to notify the App component
          const timeoutEvent = new CustomEvent('chess-timeout', {
            detail: {
              color: 'black',
              winner: 'white'
            }
          });
          window.dispatchEvent(timeoutEvent);

          // Play timeout sound
          try {
            const audio = new Audio('/timeout.mp3');
            audio.play().catch(e => console.log('Audio play failed:', e));
          } catch (e) {
            console.log('Audio not supported:', e);
          }
        }

        // Play sound alerts for low time
        if (estimatedTime <= 10 && estimatedTime > 0 && activeColor === playerColor) {
          // Only play sound if it's the player's turn and time is low
          const currentTime = Date.now();
          // Play sound at most once per second when time is low
          if (currentTime - lastSoundAlertTimeRef.current >= 1000) {
            playLowTimeSound();
            lastSoundAlertTimeRef.current = currentTime;
          }
        }

        // CRITICAL FIX: Log the timer update occasionally for debugging
        if (Math.floor(elapsed * 10) % 50 === 0) { // Log every ~5 seconds
          console.log(`Black timer update: ${estimatedTime.toFixed(1)}s (elapsed: ${elapsed.toFixed(1)}s)`);
        }
      }
    }, 100); // Update every 100ms for smooth countdown

    // Request an immediate game state update to ensure we have the latest times
    if (typeof window.requestGameStateUpdate === 'function') {
      window.requestGameStateUpdate();
    }

    // Use the Page Visibility API to handle tab visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('Tab is now visible, requesting game state update');
        // Request a game state update when the tab becomes visible again
        if (typeof window.requestGameStateUpdate === 'function') {
          window.requestGameStateUpdate();
        }
      }
    };

    // Add visibility change listener
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Clean up on unmount
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [timeWhite, timeBlack, currentTurnColor, playerColor]); // Recreate when server times or turn changes

  /**
   * Format seconds to MM:SS format
   *
   * @param {number} seconds - Time in seconds
   * @returns {string} - Formatted time string (MM:SS)
   */
  const formatTime = (seconds) => {
    if (seconds === undefined || seconds === null) return '00:00';

    // Ensure seconds is a non-negative number
    const totalSeconds = Math.max(0, Math.floor(seconds));

    // Calculate minutes and remaining seconds
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;

    // Format with leading zeros
    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(remainingSeconds).padStart(2, '0');

    return `${formattedMinutes}:${formattedSeconds}`;
  };

  /**
   * Determine if a timer should be highlighted
   *
   * @param {string} color - The color to check ('white' or 'black')
   * @returns {boolean} - Whether the timer should be highlighted
   */
  const shouldHighlight = (color) => {
    // Don't highlight any timer if spectating
    if (isSpectating) return false;

    // Highlight the current turn's timer
    return color === currentTurnColor;
  };

  /**
   * Get the appropriate CSS class for a timer
   *
   * @param {string} color - The color to get the class for ('white' or 'black')
   * @returns {string} - The CSS class
   */
  const getTimerClass = (color) => {
    let className = `timer ${color}`;

    // Add active class if this timer should be highlighted
    if (shouldHighlight(color)) {
      className += ' active';
    }

    // Add my-timer class if this is the player's timer
    if (color === playerColor) {
      className += ' my-timer';
    }

    // Get the time value for this timer
    const timeValue = color === 'white' ? clientTimeWhite : clientTimeBlack;

    // Add critical-time class if time is less than 5 seconds
    if (timeValue < 5) {
      className += ' critical-time';

      // If it's the current player's turn and their time is critical, add the urgent class
      if (color === playerColor && color === currentTurnColor) {
        className += ' urgent';
      }
    }
    // Add very-low-time class if time is less than 10 seconds
    else if (timeValue < 10) {
      className += ' very-low-time';
    }
    // Add low-time class if time is less than 30 seconds
    else if (timeValue < 30) {
      className += ' low-time';
    }

    return className;
  };

  return (
    <div className="timers-container">
      <div className={getTimerClass('black')}>
        <div className="timer-icon">♚</div>
        <div className="timer-content">
          <div className="timer-label">Black</div>
          <div className="timer-time">{formatTime(clientTimeBlack)}</div>
        </div>
      </div>

      <div className={getTimerClass('white')}>
        <div className="timer-icon">♔</div>
        <div className="timer-content">
          <div className="timer-label">White</div>
          <div className="timer-time">{formatTime(clientTimeWhite)}</div>
        </div>
      </div>
    </div>
  );
};

export default Timer;
