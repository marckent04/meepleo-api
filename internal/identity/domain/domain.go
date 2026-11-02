// Package domain holds the identity model: users and the refresh tokens that
// keep them signed in. It depends on the standard library only.
package domain

import (
	"errors"
	"time"
)

// Business errors of the identity module.
var (
	ErrInvalidAccessToken  = errors.New("invalid access token")
	ErrInvalidRefreshToken = errors.New("invalid refresh token")
	ErrRefreshTokenExpired = errors.New("refresh token expired")
	// ErrRefreshTokenReused means an already rotated token was presented
	// again: someone else may hold a copy, so its whole family is revoked.
	ErrRefreshTokenReused = errors.New("refresh token reused")
)

// UserID identifies a user.
type UserID string

// UserKind distinguishes guest accounts from registered ones.
type UserKind string

// User kinds.
const (
	KindGuest      UserKind = "guest"
	KindRegistered UserKind = "registered"
)

// User is an account. The app starts as a guest; registration (keeping the
// guest's data) comes later.
type User struct {
	ID        UserID
	Kind      UserKind
	CreatedAt time.Time
}

// RefreshToken is a stored refresh token. Only its hash is stored; the raw
// value exists only in the client.
type RefreshToken struct {
	ID        string
	UserID    UserID
	FamilyID  string
	IssuedAt  time.Time
	ExpiresAt time.Time
	RevokedAt time.Time // zero while active
}

// Check tells whether the token can be exchanged at now.
func (t RefreshToken) Check(now time.Time) error {
	if !t.RevokedAt.IsZero() {
		return ErrRefreshTokenReused
	}
	if !now.Before(t.ExpiresAt) {
		return ErrRefreshTokenExpired
	}
	return nil
}
