//
//  CryptoTest.m
//  XamanTests
//

import XCTest
@testable import Xaman

class CryptoTest: XCTestCase {
  
  override func setUp() {
    
  }
  
  override func tearDown() {
    
  }
  
  func testDataToHex() throws {
    XCTAssertEqual("0000000000000000", Crypto.DataToHex(data: Data.init(repeating: 0, count: 8)))
    XCTAssertEqual("00", Crypto.DataToHex(data: Data.init(repeating: 0, count: 1)))
    XCTAssertEqual("0a", Crypto.DataToHex(data: Data.init([10])))
    XCTAssertEqual("000000000000000a", Crypto.DataToHex(data: Data.init([0, 0, 0, 0, 0, 0, 0, 10])))
    XCTAssertEqual("0100", Crypto.DataToHex(data: Data.init([1, 0])))
    XCTAssertEqual("0000000000000101", Crypto.DataToHex(data: Data.init([0, 0, 0, 0, 0, 0, 1, 1])))
  }
  
  func testHexToData() throws {
    XCTAssertEqual(Data.init([0]), try Crypto.HexToData(hexString: "00"))
    XCTAssertEqual(Data.init([10]), try Crypto.HexToData(hexString: "0a"))
    XCTAssertEqual(Data.init([10]), try Crypto.HexToData(hexString: "0A"))
    XCTAssertEqual(Data.init([1, 0]), try Crypto.HexToData(hexString: "0100"))
    
    // round trip
    let TEST_STRING = "Hello World"
    let TEST_DATA = TEST_STRING.data(using: .utf8)
    XCTAssertEqual(TEST_DATA, try Crypto.HexToData(hexString: Crypto.DataToHex(data: TEST_DATA!)))
  }
  
  func testInvalidHex() throws {
    for value in ["", "0", "zz", "00zz", "+1", "-1", " 0", "０１", "é0"] {
      XCTAssertNil(Data(hexString: value))
      XCTAssertThrowsError(try Crypto.HexToData(hexString: value))
    }
    XCTAssertThrowsError(try Crypto.HexToData(hexString: nil))
  }

  func testInvalidPBKDF2Iterations() {
    for count in [-1, 0, Int(UInt32.max) + 1] {
      XCTAssertThrowsError(try Crypto.PBKDF2(password: Data([1]), salt: Data([2]), iteration: count))
    }
  }

  func testSHA1() throws {
    // echo -n "Hello World" | openssl sha1
    let DATA = "Hello World".data(using: .utf8)!
    let DATA_SHA1 = try Crypto.HexToData(hexString: "0a4d55a8d778e5022fab701977c5d840bbc486d0")
    XCTAssertEqual(DATA_SHA1, Crypto.SHA1Hash(data: DATA))
  }
  
  func testSHA256() throws {
    // echo -n "Hello World" | openssl sha256
    let DATA = "Hello World".data(using: .utf8)!
    let DATA_SHA256 = try Crypto.HexToData(hexString: "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e")
    XCTAssertEqual(DATA_SHA256, Crypto.SHA256Hash(data: DATA))
  }
  
  func testSHA512() throws {
    // echo -n "Hello World" | openssl sha512
    let DATA = "Hello World".data(using: .utf8)!
    let DATA_SHA512 = try Crypto.HexToData(hexString: "2c74fd17edafd80e8447b0d46741ee243b7eb74dd2149a0ab1b9246fb30382f27e853d8585719e0e67cbda0daa8f51671064615d645ae27acb15bfb1447f459b")
    XCTAssertEqual(DATA_SHA512, Crypto.SHA512Hash(data: DATA))
  }
  
  func testHMAC256() throws {
    // echo -n "Hello World" | openssl sha256 -hmac "Secret Key"
    let DATA = "Hello World".data(using: .utf8)!
    let DATA_KEY = "Secret Key".data(using: .utf8)!
    let DATA_HMAC256 = try Crypto.HexToData(hexString: "ba4f7d6c4547be22bd697e0610575ad7068ba7086e17dea752a97476fc2be9ba")
    XCTAssertEqual(DATA_HMAC256, Crypto.HMAC256(data: DATA, key: DATA_KEY))
  }
  
  func testPBKDF2() throws {
    let DATA = "Hello World".data(using: .utf8)!
    let DATA_SALT = try Crypto.HexToData(hexString: "e263d5ca3f8664326a453b6f6f34c67551ed9ea9e67e4fb1bfe51010f3dc5354")
    let DATA_PBKDF2 = try Crypto.HexToData(hexString: "3f6baa35c545b1815761d32e26fe381d53a1673518f9880e9258280c5e25b632")
    XCTAssertEqual(DATA_PBKDF2, try Crypto.PBKDF2(password: DATA, salt: DATA_SALT, iteration: 91337))
  }
  
  func testRandomBytes() throws {
    let DATA_LENGTH = 64
    let randomBytes = try! Crypto.RandomBytes(length: DATA_LENGTH)
    XCTAssertEqual(DATA_LENGTH, randomBytes.count)
  }
  
  
  func testAESCBC() throws {
    let CLEAR_TEXT = "Hello World"
    let DATA  = CLEAR_TEXT.data(using: .utf8)!
    
    let IV = try Crypto.HexToData(hexString: "e263d5ca3f8664326a453b6f6f34c675")
    let SECRET_KEY = try Crypto.HexToData(hexString: "eeefa4cae35abf41b3c4e60f71bc1f669af346097b6afb7b59ae2d7697a1fbac")
    let CIPHER = try Crypto.HexToData(hexString: "60a38734aea1098767823e7c2f697676")
    
    
    // ===== Encrypt =====
    // Should throw error as this method for CBC is deprecated
    XCTAssertThrowsError(try Crypto.AESEncrypt(algo: AESAlgo.CBC, data: DATA, using: SECRET_KEY, iv: IV, aad: Data.init([0]))) { error in
      XCTAssertEqual(error.localizedDescription,  "Crypto Error: \"AES-CBC deprecated and should not be used!\", status: -1")
    }
    
    // ===== DECRYPT =====
    XCTAssertEqual(
      DATA,
      try Crypto.AESDecrypt(algo:  AESAlgo.CBC, data: CIPHER, using: SECRET_KEY, iv: IV, aad:  Data.init([0]))
    )
  }
  
  
  func testAESGCM() throws {
    let CLEAR_TEXT = "Hello World"
    let DATA  = CLEAR_TEXT.data(using: .utf8)!
    
    let IV = try Crypto.HexToData(hexString: "e263d5ca3f8664326a453b6f6f34c675")
    let AAD = try Crypto.HexToData(hexString: "ebd2d9021e41355be56862fb103bd59b")
    let SECRET_KEY = try Crypto.HexToData(hexString: "eeefa4cae35abf41b3c4e60f71bc1f669af346097b6afb7b59ae2d7697a1fbac")
    let CIPHER = try Crypto.HexToData(hexString: "bee15cb4385c670a2a7348ebf6b1b48a747d3d3e0e319b9649fe81")
    
    
    // ===== ENCRYPT =====
    // round trip
    // try to encrypt the data and get cipher for decrypt
    let ENCRYPT_RESULT = try! Crypto.AESEncrypt(algo: AESAlgo.GCM, data: DATA, using: SECRET_KEY, iv: IV, aad: AAD)
    
    // check if we got same cipher
    XCTAssertEqual(CIPHER, ENCRYPT_RESULT)
    
    
    // ===== DECRYPT =====
    XCTAssertEqual(
      DATA,
      try Crypto.AESDecrypt(algo:  AESAlgo.GCM, data: ENCRYPT_RESULT, using: SECRET_KEY, iv: IV, aad:  AAD)
    )
  }
  
}
