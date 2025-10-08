import React, { useEffect, useRef, useState } from 'react';

const LoginScreen = () => {
  const canvasRef = useRef(null);
  const mouseRef = useRef({ x: 0, y: 0, prevX: 0, prevY: 0 });
  const verticesRef = useRef([]);
  const impactPointsRef = useRef([]);
  const particlesRef = useRef([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initVertices();
      initParticles();
    };

    const initVertices = () => {
      const cols = 50;
      const rows = 35;
      const spacing = Math.max(canvas.width / cols, canvas.height / rows);
      verticesRef.current = [];
      for (let y = -2; y <= rows + 2; y++) {
        for (let x = -2; x <= cols + 2; x++) {
          verticesRef.current.push({
            x: x * spacing, y: y * spacing, ox: x * spacing, oy: y * spacing,
            vx: 0, vy: 0, phase: Math.random() * Math.PI * 2
          });
        }
      }
    };

    const initParticles = () => {
      particlesRef.current = [];
      for (let i = 0; i < 40; i++) {
        particlesRef.current.push({
          x: Math.random() * canvas.width, y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
          size: Math.random() * 2 + 0.5, opacity: Math.random() * 0.5 + 0.2,
          hue: Math.random() * 60 + 180
        });
      }
    };

    const handleMouseMove = (e) => {
      const prevX = mouseRef.current.x;
      const prevY = mouseRef.current.y;
      const newX = e.clientX;
      const newY = e.clientY;
      const dx = newX - prevX;
      const dy = newY - prevY;
      const velocity = Math.sqrt(dx * dx + dy * dy);

      if (velocity > 2) {
        impactPointsRef.current.push({
          x: newX, y: newY, radius: 0, maxRadius: 150,
          strength: Math.min(velocity * 0.06, 6), life: 1.0
        });
      }
      mouseRef.current = { x: newX, y: newY, prevX, prevY };
    };

    const animate = () => {
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, '#2a2a35');
      gradient.addColorStop(0.5, '#35353f');
      gradient.addColorStop(1, '#2d2d38');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const time = Date.now() * 0.001;

      particlesRef.current.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
        grad.addColorStop(0, `hsla(${p.hue}, 70%, 60%, ${p.opacity})`);
        grad.addColorStop(1, `hsla(${p.hue}, 70%, 60%, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        ctx.fill();
      });

      impactPointsRef.current = impactPointsRef.current.filter(impact => {
        impact.radius += 3;
        impact.life -= 0.008;
        if (impact.life <= 0) return false;

        verticesRef.current.forEach(vertex => {
          const dx = vertex.ox - impact.x;
          const dy = vertex.oy - impact.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const influence = Math.exp(-Math.pow((distance - impact.radius) / 15, 2));
          
          if (influence > 0.01) {
            const force = influence * impact.strength * impact.life;
            const angle = Math.atan2(dy, dx);
            const variation = Math.sin(angle * 3 + time * 2) * 0.1;
            const finalForce = force * (1 + variation);
            vertex.vx += Math.cos(angle) * finalForce * 0.08;
            vertex.vy += Math.sin(angle) * finalForce * 0.08;
          }
        });
        return true;
      });

      verticesRef.current.forEach((vertex) => {
        const waveDirection = time * 1.2;
        const distanceFromEdge = Math.sqrt(
          Math.pow((vertex.ox - canvas.width / 2) / canvas.width, 2) +
          Math.pow((vertex.oy - canvas.height / 2) / canvas.height, 2)
        );
        const waveBend1 = Math.sin(vertex.ox * 0.004 + time * 0.3) * 40;
        const waveBend2 = Math.cos(vertex.ox * 0.007 - time * 0.2) * 30;
        const freqVariation = 1 + Math.sin(vertex.ox * 0.003) * 0.8;
        const wave1 = Math.sin((vertex.oy + waveBend1) * 0.005 * freqVariation + waveDirection) * 13.5;
        const wave2 = Math.sin((vertex.oy + waveBend2) * 0.009 * freqVariation + waveDirection * 1.5 + Math.PI / 3) * 9;
        const wave3 = Math.cos((vertex.ox + waveBend1 * 0.5) * 0.004 + waveDirection * 0.9) * 6.75;
        const randomFactor = Math.sin(vertex.phase + time * 2.0) * 0.3 + 1;
        const waveX = (wave1 * 0.3 + wave3) * (0.7 + distanceFromEdge * 0.3) * randomFactor;
        const waveY = (wave1 + wave2 * 0.5) * (0.8 + distanceFromEdge * 0.2) * randomFactor;
        
        vertex.vx += (vertex.ox + waveX - vertex.x) * 0.03;
        vertex.vy += (vertex.oy + waveY - vertex.y) * 0.03;
        vertex.vx *= 0.95;
        vertex.vy *= 0.95;

        const dx = vertex.x - vertex.ox;
        const dy = vertex.y - vertex.oy;
        const displacement = Math.sqrt(dx * dx + dy * dy);
        if (displacement > 40) {
          const factor = 40 / displacement;
          vertex.x = vertex.ox + dx * factor;
          vertex.y = vertex.oy + dy * factor;
          vertex.vx *= 0.5;
          vertex.vy *= 0.5;
        }
        vertex.x += vertex.vx;
        vertex.y += vertex.vy;
      });

      const cols = 50, rows = 35, totalCols = cols + 5;
      for (let y = 0; y < rows + 3; y++) {
        for (let x = 0; x < cols + 3; x++) {
          const i = y * totalCols + x;
          const vertices = verticesRef.current;
          if (vertices[i] && vertices[i + 1] && vertices[i + totalCols]) {
            drawTriangle(ctx, vertices[i], vertices[i + 1], vertices[i + totalCols]);
          }
          if (vertices[i + 1] && vertices[i + totalCols] && vertices[i + totalCols + 1]) {
            drawTriangle(ctx, vertices[i + 1], vertices[i + totalCols + 1], vertices[i + totalCols]);
          }
        }
      }

      ctx.fillStyle = 'rgba(100, 150, 200, 0.02)';
      ctx.fillRect(0, (time * 100) % canvas.height, canvas.width, 2);
      animationFrameId = requestAnimationFrame(animate);
    };

    const drawTriangle = (ctx, v1, v2, v3) => {
      const area = Math.abs((v2.x - v1.x) * (v3.y - v1.y) - (v3.x - v1.x) * (v2.y - v1.y)) / 2;
      if (area < 5) return;
      
      const normalZ = (v2.x - v1.x) * (v3.y - v1.y) - (v3.x - v1.x) * (v2.y - v1.y);
      const normalizedZ = normalZ / (Math.abs(normalZ) + 1000);
      const lightDotNormal = normalizedZ * 0.6 + 0.5;
      const shadeFactor = 0.4 + lightDotNormal * 0.6;
      const specular = Math.pow(Math.max(lightDotNormal, 0), 5) * 0.4;
      
      const distortion = (
        Math.sqrt(Math.pow(v1.x - v1.ox, 2) + Math.pow(v1.y - v1.oy, 2)) +
        Math.sqrt(Math.pow(v2.x - v2.ox, 2) + Math.pow(v2.y - v2.oy, 2)) +
        Math.sqrt(Math.pow(v3.x - v3.ox, 2) + Math.pow(v3.y - v3.oy, 2))
      ) / 3;

      const normalizedDistortion = Math.min(distortion / 40, 1);
      const colorIntensity = Math.pow(normalizedDistortion, 2.5);
      const greyValue = 15 + 65 * colorIntensity;
      const accentBlend = Math.pow(colorIntensity, 3) * 0.3;
      
      const r = Math.floor((greyValue * (1 - accentBlend) + 45 * accentBlend + specular * 50) * shadeFactor);
      const g = Math.floor((greyValue * (1 - accentBlend) + 50 * accentBlend + specular * 50) * shadeFactor);
      const b = Math.floor((greyValue * (1 - accentBlend) + 65 * accentBlend + specular * 50) * shadeFactor);

      ctx.beginPath();
      ctx.moveTo(v1.x, v1.y);
      ctx.lineTo(v2.x, v2.y);
      ctx.lineTo(v3.x, v3.y);
      ctx.closePath();
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;
      ctx.fill();
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('mousemove', handleMouseMove);
    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 1500);
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>
      <style>{`
        @keyframes gradientRotate {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100vh' }} />
      
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px' }}>
        <div style={{ width: '100%', maxWidth: '420px', position: 'relative' }}>
          <div style={{
            position: 'absolute', inset: '-2px', borderRadius: '18px',
            background: 'linear-gradient(45deg, rgba(80,140,255,0.5), rgba(100,160,255,0.5), rgba(100,180,255,0.5), rgba(80,140,255,0.5))',
            backgroundSize: '300% 300%', animation: 'gradientRotate 4s ease infinite',
            filter: 'blur(4px)', opacity: 0.6
          }} />

          <div style={{
            position: 'relative', backdropFilter: 'blur(12px)',
            backgroundColor: 'rgba(15,15,20,0.25)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderTop: '1px solid rgba(255,255,255,0.25)',
            borderRadius: '16px', padding: '48px 40px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.1) inset',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0) 100%), rgba(15,15,20,0.25)'
          }}>
            <div style={{ textAlign: 'center', marginBottom: '40px' }}>
              <div style={{
                width: '64px', height: '64px', margin: '0 auto 20px',
                background: 'linear-gradient(135deg, rgba(100,150,255,0.2), rgba(120,170,255,0.2))',
                borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid rgba(100,150,255,0.3)', boxShadow: '0 0 30px rgba(100,150,255,0.3)'
              }}>
                <svg width="32" height="32" viewBox="0 0 32 32">
                  <rect x="6" y="8" width="20" height="16" rx="2" fill="none" stroke="rgba(100,150,255,0.8)" strokeWidth="2"/>
                  <path d="M6 12h20M12 8v16M20 8v16" stroke="rgba(100,150,255,0.6)" strokeWidth="1.5"/>
                  <circle cx="16" cy="16" r="3" fill="rgba(150,200,255,0.6)">
                    <animate attributeName="r" values="3;4;3" dur="2s" repeatCount="indefinite"/>
                  </circle>
                  <circle cx="16" cy="16" r="5" fill="none" stroke="rgba(150,200,255,0.4)" strokeWidth="1">
                    <animate attributeName="r" values="5;6;5" dur="2s" repeatCount="indefinite"/>
                    <animate attributeName="opacity" values="0.4;0.8;0.4" dur="2s" repeatCount="indefinite"/>
                  </circle>
                </svg>
              </div>
              
              <h1 style={{
                fontSize: '28px', fontWeight: '700', color: '#ffffff',
                margin: '0 0 8px 0', letterSpacing: '-0.5px'
              }}>NDT Data Hub</h1>
              <p style={{ fontSize: '14px', color: 'rgba(150,180,255,0.7)', margin: 0, fontWeight: '500' }}>
                Secure Authentication Portal
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '24px', position: 'relative' }}>
                <input
                  type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  style={{
                    width: '100%', padding: '16px 16px 16px 48px', fontSize: '15px',
                    color: '#fff', backgroundColor: 'rgba(255,255,255,0.05)',
                    border: `1px solid ${emailFocused ? 'rgba(100,150,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: '10px', outline: 'none', boxSizing: 'border-box',
                    transition: 'all 0.3s', boxShadow: emailFocused ? '0 0 0 3px rgba(100,150,255,0.1), 0 0 20px rgba(100,150,255,0.2)' : 'none'
                  }}
                />
                <label style={{
                  position: 'absolute', left: '48px',
                  top: emailFocused || email ? '6px' : '50%',
                  transform: emailFocused || email ? 'translateY(0)' : 'translateY(-50%)',
                  fontSize: emailFocused || email ? '11px' : '15px',
                  color: emailFocused ? 'rgba(100,150,255,0.9)' : 'rgba(255,255,255,0.5)',
                  transition: 'all 0.3s', pointerEvents: 'none', fontWeight: '500'
                }}>Email Address</label>
                <svg width="20" height="20" viewBox="0 0 20 20" style={{
                  position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)',
                  opacity: emailFocused ? 1 : 0.5, transition: 'opacity 0.3s'
                }}>
                  <path d="M2 4h16v12H2V4zm0 1l8 5 8-5M2 5v10" fill="none" 
                    stroke={emailFocused ? 'rgba(100,150,255,0.9)' : 'rgba(255,255,255,0.5)'} strokeWidth="1.5"/>
                </svg>
              </div>

              <div style={{ marginBottom: '32px', position: 'relative' }}>
                <input
                  type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  style={{
                    width: '100%', padding: '16px 16px 16px 48px', fontSize: '15px',
                    color: '#fff', backgroundColor: 'rgba(255,255,255,0.05)',
                    border: `1px solid ${passwordFocused ? 'rgba(100,150,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: '10px', outline: 'none', boxSizing: 'border-box',
                    transition: 'all 0.3s', boxShadow: passwordFocused ? '0 0 0 3px rgba(100,150,255,0.1), 0 0 20px rgba(100,150,255,0.2)' : 'none'
                  }}
                />
                <label style={{
                  position: 'absolute', left: '48px',
                  top: passwordFocused || password ? '6px' : '50%',
                  transform: passwordFocused || password ? 'translateY(0)' : 'translateY(-50%)',
                  fontSize: passwordFocused || password ? '11px' : '15px',
                  color: passwordFocused ? 'rgba(100,150,255,0.9)' : 'rgba(255,255,255,0.5)',
                  transition: 'all 0.3s', pointerEvents: 'none', fontWeight: '500'
                }}>Password</label>
                <svg width="20" height="20" viewBox="0 0 20 20" style={{
                  position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)',
                  opacity: passwordFocused ? 1 : 0.5, transition: 'opacity 0.3s'
                }}>
                  <rect x="4" y="8" width="12" height="9" rx="1" fill="none" 
                    stroke={passwordFocused ? 'rgba(100,150,255,0.9)' : 'rgba(255,255,255,0.5)'} strokeWidth="1.5"/>
                  <path d="M7 8V6a3 3 0 016 0v2" fill="none" 
                    stroke={passwordFocused ? 'rgba(100,150,255,0.9)' : 'rgba(255,255,255,0.5)'} strokeWidth="1.5"/>
                </svg>
              </div>

              <button type="submit" disabled={isLoading} style={{
                width: '100%', padding: '16px', fontSize: '15px', fontWeight: '600',
                color: '#fff', background: 'linear-gradient(135deg, rgba(90,150,255,0.9), rgba(110,170,255,0.9))',
                border: 'none', borderRadius: '10px', cursor: isLoading ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s', marginBottom: '20px', position: 'relative',
                boxShadow: '0 4px 20px rgba(100,150,255,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {isLoading ? (
                  <div style={{
                    width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.3)',
                    borderTop: '2px solid #fff', borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite'
                  }} />
                ) : 'Sign In'}
              </button>

              <div style={{ textAlign: 'center' }}>
                <a href="#" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>
                  Forgot password?
                </a>
              </div>
            </form>

            <div style={{ display: 'flex', alignItems: 'center', margin: '32px 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
              <span style={{ padding: '0 16px', fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>or</span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
            </div>

            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>Don't have an account? </span>
              <a href="#" style={{ fontSize: '14px', color: 'rgba(120,160,220,0.9)', textDecoration: 'none', fontWeight: '500' }}>
                Sign up
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;