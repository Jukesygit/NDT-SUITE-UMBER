import React, { useState, useEffect } from 'react';
import { validatePasswordStrength } from '../config/security.js';

const PasswordStrengthIndicator = ({
    password,
    userInfo = {},
    showRequirements = true,
    onStrengthChange = () => {}
}) => {
    const [strength, setStrength] = useState(null);

    useEffect(() => {
        if (!password) {
            setStrength(null);
            onStrengthChange(null);
            return;
        }

        const result = validatePasswordStrength(password, userInfo);
        setStrength(result);
        onStrengthChange(result);
    }, [password, userInfo]);

    if (!password || !strength) {
        return null;
    }

    const getStrengthColor = (score) => {
        switch (score) {
            case 0: return '#ef4444'; // red
            case 1: return '#f97316'; // orange
            case 2: return '#eab308'; // yellow
            case 3: return '#84cc16'; // lime
            case 4: return '#22c55e'; // green
            default: return '#6b7280'; // gray
        }
    };

    const getStrengthWidth = (score) => {
        return `${(score / 4) * 100}%`;
    };

    return (
        <div className="password-strength-indicator">
            {/* Strength Bar */}
            <div style={{
                marginTop: '8px',
                marginBottom: '12px'
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '4px'
                }}>
                    <span style={{
                        fontSize: '12px',
                        fontWeight: '500',
                        color: 'rgba(255, 255, 255, 0.7)'
                    }}>
                        Password Strength
                    </span>
                    <span style={{
                        fontSize: '12px',
                        fontWeight: '600',
                        color: getStrengthColor(strength.score)
                    }}>
                        {strength.strength}
                    </span>
                </div>

                <div style={{
                    width: '100%',
                    height: '4px',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '2px',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        width: getStrengthWidth(strength.score),
                        height: '100%',
                        backgroundColor: getStrengthColor(strength.score),
                        transition: 'all 0.3s ease',
                        borderRadius: '2px'
                    }} />
                </div>
            </div>

            {/* Requirements Checklist */}
            {showRequirements && (
                <div style={{
                    fontSize: '12px',
                    marginTop: '12px'
                }}>
                    <div style={{
                        fontWeight: '500',
                        marginBottom: '8px',
                        color: 'rgba(255, 255, 255, 0.7)'
                    }}>
                        Requirements:
                    </div>

                    <div style={{
                        display: 'grid',
                        gap: '4px'
                    }}>
                        <RequirementItem
                            met={strength.requirements.length}
                            text="At least 12 characters"
                        />
                        <RequirementItem
                            met={strength.requirements.uppercase}
                            text="One uppercase letter"
                        />
                        <RequirementItem
                            met={strength.requirements.lowercase}
                            text="One lowercase letter"
                        />
                        <RequirementItem
                            met={strength.requirements.numbers}
                            text="One number"
                        />
                        <RequirementItem
                            met={strength.requirements.special}
                            text="One special character"
                        />
                        <RequirementItem
                            met={strength.requirements.notCommon}
                            text="Not a common password"
                        />
                        {userInfo.username && (
                            <RequirementItem
                                met={strength.requirements.noUserInfo}
                                text="Doesn't contain personal info"
                            />
                        )}
                    </div>
                </div>
            )}

            {/* Feedback Messages */}
            {strength.feedback && strength.feedback.length > 0 && (
                <div style={{
                    marginTop: '12px',
                    padding: '8px',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: '6px'
                }}>
                    {strength.feedback.map((msg, index) => (
                        <div key={index} style={{
                            fontSize: '12px',
                            color: '#fca5a5',
                            marginBottom: index < strength.feedback.length - 1 ? '4px' : '0'
                        }}>
                            • {msg}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const RequirementItem = ({ met, text }) => {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: met ? '#86efac' : 'rgba(255, 255, 255, 0.5)'
        }}>
            <span style={{ fontSize: '14px' }}>
                {met ? '✓' : '○'}
            </span>
            <span style={{
                textDecoration: met ? 'line-through' : 'none',
                opacity: met ? 0.8 : 1
            }}>
                {text}
            </span>
        </div>
    );
};

export default PasswordStrengthIndicator;