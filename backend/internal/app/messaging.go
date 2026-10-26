package app

import (
	"context"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"edupilot/internal/events"
)

type Announcement struct {
	ID         string    `json:"id"`
	AuthorName *string   `json:"author_name"`
	AuthorID   *string   `json:"author_id"`
	ClassID    *string   `json:"class_id"`
	ClassName  *string   `json:"class_name"`
	Title      string    `json:"title"`
	Body       string    `json:"body"`
	CreatedAt  time.Time `json:"created_at"`
	Read       bool      `json:"read"`
	ReadCount  int       `json:"read_count"`
}

// ListAnnouncements : annonces générales + celles des classes de l'utilisateur.
func (a *App) ListAnnouncements(ctx context.Context, p *Principal) ([]Announcement, error) {
	rows, err := a.Pool.Query(ctx, `
		SELECT an.id, u.full_name, an.author_id::text, an.class_id::text, c.name, an.title, an.body, an.created_at,
		       EXISTS (SELECT 1 FROM announcement_reads r WHERE r.announcement_id = an.id AND r.user_id = $1),
		       (SELECT count(*) FROM announcement_reads r WHERE r.announcement_id = an.id)::int
		FROM announcements an LEFT JOIN users u ON u.id = an.author_id LEFT JOIN classes c ON c.id = an.class_id
		WHERE $2 OR an.class_id IS NULL OR an.class_id::text = ANY($3)
		ORDER BY an.created_at DESC LIMIT 200`, p.UserID, p.IsAdmin(), p.ClassIDs)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Announcement])
}

type AnnouncementInput struct {
	ClassID *string `json:"class_id"`
	Title   string  `json:"title"`
	Body    string  `json:"body"`
}

func (a *App) PostAnnouncement(ctx context.Context, p *Principal, in AnnouncementInput) error {
	if in.ClassID != nil && *in.ClassID == "" {
		in.ClassID = nil
	}
	if in.ClassID == nil {
		if err := requireAdmin(p); err != nil {
			return err
		}
	} else if err := requireClass(p, *in.ClassID); err != nil {
		return err
	}
	in.Title, in.Body = truncate(strings.TrimSpace(in.Title), 150), truncate(strings.TrimSpace(in.Body), 5000)
	if in.Title == "" || in.Body == "" {
		return invalid("titre et message obligatoires")
	}
	return a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		var id string
		if err := tx.QueryRow(ctx, `INSERT INTO announcements (author_id, class_id, title, body) VALUES ($1, $2, $3, $4) RETURNING id`,
			p.UserID, in.ClassID, in.Title, in.Body).Scan(&id); err != nil {
			return nil, mapPgErr(err, "")
		}
		return []events.Event{ev(p, "announcement.published", id, map[string]any{"class_id": in.ClassID, "title": in.Title})}, nil
	})
}

func (a *App) DeleteAnnouncement(ctx context.Context, p *Principal, id string) error {
	return a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		tag, err := tx.Exec(ctx, `DELETE FROM announcements WHERE id = $1 AND ($2 OR author_id = $3)`, id, p.IsAdmin(), p.UserID)
		if err != nil {
			return nil, mapPgErr(err, "")
		}
		if tag.RowsAffected() == 0 {
			return nil, ErrNotFound
		}
		return []events.Event{ev(p, "announcement.deleted", id, nil)}, nil
	})
}

func (a *App) MarkAnnouncementRead(ctx context.Context, p *Principal, id string) error {
	_, err := a.Pool.Exec(ctx, `INSERT INTO announcement_reads (announcement_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, id, p.UserID)
	return mapPgErr(err, "")
}

type Notification struct {
	ID        string     `json:"id"`
	Kind      string     `json:"kind"`
	Title     string     `json:"title"`
	Body      string     `json:"body"`
	CreatedAt time.Time  `json:"created_at"`
	ReadAt    *time.Time `json:"read_at"`
}

func (a *App) ListNotifications(ctx context.Context, p *Principal) ([]Notification, error) {
	rows, err := a.Pool.Query(ctx, `SELECT id, kind, title, body, created_at, read_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`, p.UserID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Notification])
}

func (a *App) MarkNotificationsRead(ctx context.Context, p *Principal, id string) error {
	_, err := a.Pool.Exec(ctx, `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL AND ($2 = '' OR id::text = $2)`, p.UserID, id)
	return err
}

type UnreadCounts struct {
	Notifications int `json:"notifications"`
	Announcements int `json:"announcements"`
}

func (a *App) Unread(ctx context.Context, p *Principal) (UnreadCounts, error) {
	var u UnreadCounts
	err := a.Pool.QueryRow(ctx, `
		SELECT (SELECT count(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL)::int,
		       (SELECT count(*) FROM announcements an WHERE ($2 OR an.class_id IS NULL OR an.class_id::text = ANY($3))
		          AND an.author_id IS DISTINCT FROM $1
		          AND NOT EXISTS (SELECT 1 FROM announcement_reads r WHERE r.announcement_id = an.id AND r.user_id = $1))::int`,
		p.UserID, p.IsAdmin(), p.ClassIDs).Scan(&u.Notifications, &u.Announcements)
	return u, err
}

// ---------------------------------------------------------------- avis

type Feedback struct {
	ID        string    `json:"id"`
	UserName  *string   `json:"user_name"`
	Role      *string   `json:"role"`
	Rating    int       `json:"rating"`
	Comment   string    `json:"comment"`
	CreatedAt time.Time `json:"created_at"`
}

func (a *App) SubmitFeedback(ctx context.Context, p *Principal, rating int, comment string) error {
	if rating < 1 || rating > 5 {
		return invalid("note entre 1 et 5")
	}
	if err := a.rateLimit(ctx, "feedback:"+p.UserID, 3, time.Hour); err != nil {
		return err
	}
	return a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		_, err := tx.Exec(ctx, `INSERT INTO feedback (user_id, rating, comment) VALUES ($1, $2, $3)`, p.UserID, rating, truncate(strings.TrimSpace(comment), 2000))
		return []events.Event{ev(p, "feedback.submitted", p.UserID, map[string]any{"rating": rating})}, err
	})
}

func (a *App) ListFeedback(ctx context.Context, p *Principal) ([]Feedback, error) {
	if err := requireAdmin(p); err != nil {
		return nil, err
	}
	rows, err := a.Pool.Query(ctx, `SELECT f.id, u.full_name, u.role, f.rating, f.comment, f.created_at FROM feedback f LEFT JOIN users u ON u.id = f.user_id ORDER BY f.created_at DESC LIMIT 500`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Feedback])
}
