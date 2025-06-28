module Bpe (
  Token,
  BpeEncoded,
  TokenRec,
  BpeTable,
  toBpeEncoded,
  canCompress,
  buildBpeTable,
) where

import Data.List.Extra (dropEnd1)
import qualified Data.Map as Map

data Token
  = T Int
  | C Char
  deriving (Show, Eq, Ord)

type BpeEncoded = [Token]
type TokenRec = (Token, Token)
type BpeTable' = Map.Map TokenRec Int
newtype BpeTable = BpeTable BpeTable'

instance Show BpeTable where
  show (BpeTable table)
    | Map.null table = "No BPE pairs found."
    | otherwise =
        dropEnd1 $ Map.foldMapWithKey showPair table
   where
    showTokenFromBpe :: BpeTable' -> Token -> String
    showToken = showTokenFromBpe table
    showTokenFromBpe tbl (T i) = concatMap showToken (fst $ Map.elemAt i tbl)
    showTokenFromBpe _ (C c) = [c]
    showPair (l, r) v = concatMap showToken [l, r] ++ " -> " ++ show v ++ "\n"

toBpeEncoded :: String -> BpeEncoded
toBpeEncoded = map C

toPairs :: [a] -> [(a, a)]
toPairs t = zip t $ tail t

canCompress :: BpeEncoded -> Bool
canCompress = canCompress' [] . toPairs
 where
  canCompress' :: [TokenRec] -> [TokenRec] -> Bool
  canCompress' _ [] = False
  canCompress' seen (x : xs)
    | x `elem` seen = True
    | otherwise = canCompress' (seen ++ [x]) xs

buildBpeTable :: BpeEncoded -> BpeTable
buildBpeTable = BpeTable . flip buildBpeTable' Map.empty . toPairs
 where
  buildBpeTable' :: [TokenRec] -> BpeTable' -> BpeTable'
  buildBpeTable' [] = id
  buildBpeTable' (x : xs) = Map.insertWith (+) x 1 . buildBpeTable' xs

compressBpe :: BpeEncoded -> (BpeEncoded, BpeTable)
compressBpe encoded = compressBpe' encoded $ buildBpeTable encoded
 where
  compressBpe' :: BpeEncoded -> BpeTable -> (BpeEncoded, BpeTable)
