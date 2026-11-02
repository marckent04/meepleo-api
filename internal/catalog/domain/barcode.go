package domain

import "fmt"

// Barcode is a validated product barcode, normalized to EAN-13.
//
// Boxes sold in Europe carry an EAN-13 and boxes sold in North America a
// UPC-A (12 digits). A UPC-A is an EAN-13 with a leading 0, so both are
// stored as EAN-13 and the same box is found whichever form is scanned.
type Barcode string

// ParseBarcode validates an EAN-13 or UPC-A (digits and check digit) and
// returns it normalized to EAN-13.
func ParseBarcode(raw string) (Barcode, error) {
	switch len(raw) {
	case 12:
		raw = "0" + raw
	case 13:
	default:
		return "", fmt.Errorf("%w: expected 12 or 13 digits, got %d characters", ErrBarcodeInvalid, len(raw))
	}
	sum := 0
	for i := range 12 {
		c := raw[i]
		if c < '0' || c > '9' {
			return "", fmt.Errorf("%w: non-digit character", ErrBarcodeInvalid)
		}
		d := int(c - '0')
		if i%2 == 1 {
			d *= 3
		}
		sum += d
	}
	check := raw[12]
	if check < '0' || check > '9' || int(check-'0') != (10-sum%10)%10 {
		return "", fmt.Errorf("%w: wrong check digit", ErrBarcodeInvalid)
	}
	return Barcode(raw), nil
}

func (b Barcode) String() string { return string(b) }
