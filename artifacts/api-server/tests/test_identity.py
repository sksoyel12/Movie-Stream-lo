import unittest

from pydantic import ValidationError

from app.routers.identity import SyncIdentityRequest, _new_unique_user_id


class NumericIdentityTests(unittest.TestCase):
    def test_uid_generates_stable_twelve_digit_id(self):
        first = _new_unique_user_id("firebase-user-one")
        second = _new_unique_user_id("firebase-user-one")

        self.assertEqual(first, second)
        self.assertTrue(first.isdigit())
        self.assertEqual(len(first), 12)

    def test_different_uids_get_different_numeric_ids(self):
        first = _new_unique_user_id("firebase-user-one")
        second = _new_unique_user_id("firebase-user-two")

        self.assertNotEqual(first, second)

    def test_sync_request_accepts_only_twelve_digit_smo_ids(self):
        request = SyncIdentityRequest(smoId="849201948276")

        self.assertEqual(request.smo_id, "849201948276")
        with self.assertRaises(ValidationError):
            SyncIdentityRequest(smoId="SMO-IN-DEVICE-36B7B3B4")


if __name__ == "__main__":
    unittest.main()
